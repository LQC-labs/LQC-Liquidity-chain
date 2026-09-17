// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {IERC20} from "../interfaces/IERC20.sol";

interface ILQCLendingMarkets {
    struct MarketConfig { address collateralAsset; address debtAsset; uint8 collateralDecimals; uint8 debtDecimals; uint16 maxLtvBps; uint16 liquidationThresholdBps; uint16 liquidationBonusBps; uint128 supplyCap; uint128 borrowCap; uint128 minBorrow; bool enabled; }
    struct AccountRisk { uint256 collateralValue; uint256 debtValue; uint256 maxDebtValue; uint256 liquidationDebtValue; uint256 healthFactor; bool borrowAllowed; bool liquidatable; }
    function getMarket(bytes32 id) external view returns (MarketConfig memory);
    function validateCaps(bytes32 id,uint256 totalSupplyAfter,uint256 totalBorrowAfter) external view;
    function validateBorrowAmount(bytes32 id,uint256 accountDebtAfter) external view;
    function accountRisk(bytes32 id,uint256 collateralAmount,uint256 debtAmount) external view returns(AccountRisk memory);
}

interface ILQCLendingIndexes {
    function indexStates(bytes32 id) external view returns(uint128 borrowIndexRay,uint128 supplyIndexRay,uint64 lastAccrued);
    function accrue(bytes32 id,uint256 totalBorrow,uint256 totalLiquidity) external returns(uint256 borrowIndexRay,uint256 supplyIndexRay);
    function preview(bytes32 id,uint256 totalBorrow,uint256 totalLiquidity) external view returns(uint256 borrowIndexRay,uint256 supplyIndexRay);
    function applySupplyLoss(bytes32 id,uint256 loss,uint256 totalSupply) external returns(uint256 supplyIndexRay);
}

/// @notice Isolated-market custody with indexed lender shares and borrower debt shares.
contract LQCLendingCore {
    using SafeTransferLib for address;
    uint256 public constant RAY=1e27;
    struct MarketState { uint128 totalCollateral; uint128 totalSupplyShares; uint128 totalDebtShares; }

    address public owner; address public pendingOwner; address public liquidationEngine;
    ILQCLendingMarkets public immutable registry; ILQCLendingIndexes public immutable interestIndex;
    mapping(bytes32=>MarketState) public marketStates;
    mapping(bytes32=>mapping(address=>uint256)) public collateralOf;
    mapping(bytes32=>mapping(address=>uint256)) public liquiditySharesOf;
    mapping(bytes32=>mapping(address=>uint256)) public debtSharesOf;
    mapping(bytes32=>mapping(address=>uint256)) public badDebtSharesOf;
    mapping(bytes32=>uint256) public totalBadDebtShares;
    mapping(bytes32=>uint256) public accruedReserves;
    mapping(bytes32=>uint256) public realizedSupplierLosses;
    uint256 private unlocked=1;

    event CollateralDeposited(bytes32 indexed marketId,address indexed account,uint256 amount);
    event CollateralWithdrawn(bytes32 indexed marketId,address indexed account,address indexed receiver,uint256 amount);
    event LiquiditySupplied(bytes32 indexed marketId,address indexed account,uint256 amount,uint256 shares);
    event LiquidityWithdrawn(bytes32 indexed marketId,address indexed account,address indexed receiver,uint256 amount,uint256 shares);
    event Borrowed(bytes32 indexed marketId,address indexed account,address indexed receiver,uint256 amount,uint256 shares);
    event Repaid(bytes32 indexed marketId,address indexed payer,address indexed account,uint256 amount,uint256 shares);
    event MarketInterestAccrued(bytes32 indexed marketId,uint256 borrowerInterest,uint256 supplierInterest,uint256 reserveInterest);
    event ReservesWithdrawn(bytes32 indexed marketId,address indexed receiver,uint256 amount);
    event LiquidationEngineUpdated(address indexed previousEngine,address indexed newEngine);
    event PositionLiquidated(bytes32 indexed marketId,address indexed account,address indexed liquidator,uint256 repaid,uint256 collateralSeized);
    event BadDebtRecorded(bytes32 indexed marketId,address indexed account,uint256 debtShares);
    event BadDebtCovered(bytes32 indexed marketId,address indexed account,uint8 indexed method,uint256 amount,uint256 debtShares);
    event SupplierLossRealized(bytes32 indexed marketId,address indexed account,uint256 amount,uint256 cumulativeLoss);
    event OwnershipTransferStarted(address indexed owner,address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner,address indexed newOwner);

    error Unauthorized(); error ZeroAddress(); error InvalidAmount(); error UnsafePosition();
    error InsufficientLiquidity(); error InexactTransfer(); error Reentrancy(); error InsufficientReserves(); error NotLiquidatable(); error LossLimitExceeded();
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier nonReentrant(){if(unlocked!=1)revert Reentrancy();unlocked=2;_;unlocked=1;}

    constructor(address owner_,address registry_,address interestIndex_){
        if(owner_==address(0)||registry_==address(0)||interestIndex_==address(0))revert ZeroAddress();
        owner=owner_;registry=ILQCLendingMarkets(registry_);interestIndex=ILQCLendingIndexes(interestIndex_);emit OwnershipTransferred(address(0),owner_);
    }

    function depositCollateral(bytes32 id,uint256 amount) external nonReentrant{
        if(amount==0)revert InvalidAmount();_accrue(id);ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);MarketState storage state=marketStates[id];
        uint256 totalAfter=uint256(state.totalCollateral)+amount;registry.validateCaps(id,totalAfter,_totalDebt(state,_borrowIndex(id)));
        _pullExact(config.collateralAsset,msg.sender,amount);state.totalCollateral=_toUint128(totalAfter);collateralOf[id][msg.sender]+=amount;emit CollateralDeposited(id,msg.sender,amount);
    }

    function withdrawCollateral(bytes32 id,uint256 amount,address receiver) external nonReentrant{
        if(amount==0)revert InvalidAmount();if(receiver==address(0))revert ZeroAddress();_accrue(id);uint256 collateralAfter=collateralOf[id][msg.sender]-amount;uint256 debt=debtOf(id,msg.sender);
        if(debt!=0&&!registry.accountRisk(id,collateralAfter,debt).borrowAllowed)revert UnsafePosition();ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);
        collateralOf[id][msg.sender]=collateralAfter;marketStates[id].totalCollateral-=uint128(amount);config.collateralAsset.safeTransfer(receiver,amount);emit CollateralWithdrawn(id,msg.sender,receiver,amount);
    }

    function supplyLiquidity(bytes32 id,uint256 amount) external nonReentrant{
        if(amount==0)revert InvalidAmount();_accrue(id);ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);MarketState storage state=marketStates[id];
        registry.validateCaps(id,state.totalCollateral,_totalDebt(state,_borrowIndex(id)));uint256 supplyIndex=_supplyIndex(id);uint256 shares=amount*RAY/supplyIndex;if(shares==0)revert InvalidAmount();
        _pullExact(config.debtAsset,msg.sender,amount);state.totalSupplyShares=_toUint128(uint256(state.totalSupplyShares)+shares);liquiditySharesOf[id][msg.sender]+=shares;emit LiquiditySupplied(id,msg.sender,amount,shares);
    }

    function withdrawLiquidity(bytes32 id,uint256 amount,address receiver) external nonReentrant{
        if(amount==0)revert InvalidAmount();if(receiver==address(0))revert ZeroAddress();_accrue(id);uint256 supplyIndex=_supplyIndex(id);uint256 claim=liquidityOf(id,msg.sender);
        if(amount>claim||amount>availableLiquidity(id))revert InsufficientLiquidity();uint256 shares=amount==claim?liquiditySharesOf[id][msg.sender]:_ceilDiv(amount*RAY,supplyIndex);
        ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);liquiditySharesOf[id][msg.sender]-=shares;marketStates[id].totalSupplyShares-=uint128(shares);
        config.debtAsset.safeTransfer(receiver,amount);emit LiquidityWithdrawn(id,msg.sender,receiver,amount,shares);
    }

    function borrow(bytes32 id,uint256 amount,address receiver) external nonReentrant{
        if(amount==0)revert InvalidAmount();if(receiver==address(0))revert ZeroAddress();_accrue(id);if(badDebtSharesOf[id][msg.sender]!=0)revert UnsafePosition();if(amount>availableLiquidity(id))revert InsufficientLiquidity();MarketState storage state=marketStates[id];
        uint256 borrowIndex=_borrowIndex(id);uint256 shares=_ceilDiv(amount*RAY,borrowIndex);uint256 debtAfter=(debtSharesOf[id][msg.sender]+shares)*borrowIndex/RAY;
        uint256 totalBorrowAfter=(uint256(state.totalDebtShares)+shares)*borrowIndex/RAY;registry.validateCaps(id,state.totalCollateral,totalBorrowAfter);registry.validateBorrowAmount(id,debtAfter);
        if(!registry.accountRisk(id,collateralOf[id][msg.sender],debtAfter).borrowAllowed)revert UnsafePosition();ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);
        debtSharesOf[id][msg.sender]+=shares;state.totalDebtShares=_toUint128(uint256(state.totalDebtShares)+shares);config.debtAsset.safeTransfer(receiver,amount);emit Borrowed(id,msg.sender,receiver,amount,shares);
    }

    function repay(bytes32 id,uint256 amount,address account) external nonReentrant returns(uint256 repaid){
        if(amount==0)revert InvalidAmount();if(account==address(0))revert ZeroAddress();_accrue(id);uint256 sharesHeld=debtSharesOf[id][account];uint256 borrowIndex=_borrowIndex(id);uint256 debt=sharesHeld*borrowIndex/RAY;
        if(debt==0)revert InvalidAmount();uint256 shares;if(amount>=debt){shares=sharesHeld;repaid=debt;}else{shares=amount*RAY/borrowIndex;if(shares==0)revert InvalidAmount();repaid=shares*borrowIndex/RAY;}
        uint256 debtAfter=(sharesHeld-shares)*borrowIndex/RAY;if(debtAfter!=0)registry.validateBorrowAmount(id,debtAfter);ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);
        _pullExact(config.debtAsset,msg.sender,repaid);debtSharesOf[id][account]=sharesHeld-shares;marketStates[id].totalDebtShares-=uint128(shares);
        uint256 badShares=badDebtSharesOf[id][account];if(badShares!=0){uint256 cleared=shares<badShares?shares:badShares;badDebtSharesOf[id][account]=badShares-cleared;totalBadDebtShares[id]-=cleared;}
        emit Repaid(id,msg.sender,account,repaid,shares);
    }

    function executeLiquidation(bytes32 id,address account,address payer,address receiver,uint256 requestedRepay)
        external nonReentrant returns(uint256 repaid,uint256 collateralSeized)
    {
        if(msg.sender!=liquidationEngine)revert Unauthorized();if(account==address(0)||payer==address(0)||receiver==address(0))revert ZeroAddress();if(requestedRepay==0)revert InvalidAmount();_accrue(id);
        uint256 debt=debtOf(id,account);uint256 collateral=collateralOf[id][account];ILQCLendingMarkets.AccountRisk memory risk=registry.accountRisk(id,collateral,debt);if(!risk.liquidatable)revert NotLiquidatable();
        ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);uint256 maxClose=(debt+1)/2;repaid=requestedRepay<maxClose?requestedRepay:maxClose;
        ILQCLendingMarkets.AccountRisk memory unitDebt=registry.accountRisk(id,0,10**config.debtDecimals);ILQCLendingMarkets.AccountRisk memory unitCollateral=registry.accountRisk(id,10**config.collateralDecimals,0);
        uint256 repayValue=repaid*unitDebt.debtValue/(10**config.debtDecimals);uint256 seizeValue=repayValue*(10_000+config.liquidationBonusBps)/10_000;
        collateralSeized=_ceilDiv(seizeValue*(10**config.collateralDecimals),unitCollateral.collateralValue);
        if(collateralSeized>collateral){collateralSeized=collateral;seizeValue=collateral*unitCollateral.collateralValue/(10**config.collateralDecimals);repayValue=seizeValue*10_000/(10_000+config.liquidationBonusBps);repaid=repayValue*(10**config.debtDecimals)/unitDebt.debtValue;}
        uint256 borrowIndex=_borrowIndex(id);uint256 shares=repaid>=debt?debtSharesOf[id][account]:repaid*RAY/borrowIndex;if(shares==0||collateralSeized==0)revert InvalidAmount();repaid=shares*borrowIndex/RAY;
        _pullExact(config.debtAsset,payer,repaid);debtSharesOf[id][account]-=shares;marketStates[id].totalDebtShares-=uint128(shares);collateralOf[id][account]-=collateralSeized;marketStates[id].totalCollateral-=uint128(collateralSeized);config.collateralAsset.safeTransfer(receiver,collateralSeized);
        uint256 debtAfter=debtSharesOf[id][account]*borrowIndex/RAY;if(collateralOf[id][account]==0&&debtAfter!=0){uint256 previousBad=badDebtSharesOf[id][account];uint256 newBad=debtSharesOf[id][account];badDebtSharesOf[id][account]=newBad;totalBadDebtShares[id]+=newBad-previousBad;emit BadDebtRecorded(id,account,newBad);}
        emit PositionLiquidated(id,account,payer,repaid,collateralSeized);
    }

    function accrueInterest(bytes32 id) external nonReentrant{_accrue(id);}
    function withdrawReserves(bytes32 id,uint256 amount,address receiver) external onlyOwner nonReentrant{
        if(amount==0)revert InvalidAmount();if(receiver==address(0))revert ZeroAddress();_accrue(id);if(amount>accruedReserves[id]||amount>availableLiquidity(id))revert InsufficientReserves();
        accruedReserves[id]-=amount;registry.getMarket(id).debtAsset.safeTransfer(receiver,amount);emit ReservesWithdrawn(id,receiver,amount);
    }

    function coverBadDebtWithReserves(bytes32 id,address account,uint256 maxAmount) external onlyOwner nonReentrant returns(uint256 covered){
        if(maxAmount==0)revert InvalidAmount();_accrue(id);uint256 available=accruedReserves[id];if(available==0)revert InsufficientReserves();
        (covered,)=_burnBadDebt(id,account,maxAmount<available?maxAmount:available);accruedReserves[id]-=covered;emit BadDebtCovered(id,account,1,covered,0);
    }

    function recapitalizeBadDebt(bytes32 id,address account,uint256 maxAmount) external onlyOwner nonReentrant returns(uint256 covered){
        if(maxAmount==0)revert InvalidAmount();_accrue(id);uint256 shares;(covered,shares)=_burnBadDebt(id,account,maxAmount);
        _pullExact(registry.getMarket(id).debtAsset,msg.sender,covered);emit BadDebtCovered(id,account,2,covered,shares);
    }

    function realizeBadDebtLoss(bytes32 id,address account,uint256 maxAmount) external onlyOwner nonReentrant returns(uint256 writtenOff){
        if(maxAmount==0)revert InvalidAmount();_accrue(id);ILQCLendingMarkets.MarketConfig memory config=registry.getMarket(id);if(config.enabled)revert Unauthorized();
        MarketState memory state=marketStates[id];uint256 supplyIndex=_supplyIndex(id);uint256 supplyBefore=_totalSupply(state,supplyIndex);uint256 bad=badDebtSharesOf[id][account]*_borrowIndex(id)/RAY;
        uint256 requested=maxAmount<bad?maxAmount:bad;uint256 historicalBase=supplyBefore+realizedSupplierLosses[id];uint256 remainingLimit=historicalBase*2_000/10_000-realizedSupplierLosses[id];
        if(requested==0||requested>remainingLimit||requested>=supplyBefore)revert LossLimitExceeded();uint256 newIndex=interestIndex.applySupplyLoss(id,requested,supplyBefore);
        uint256 actualLoss=supplyBefore-_totalSupply(state,newIndex);uint256 shares;(writtenOff,shares)=_burnBadDebt(id,account,actualLoss);realizedSupplierLosses[id]+=actualLoss;
        emit BadDebtCovered(id,account,3,writtenOff,shares);emit SupplierLossRealized(id,account,actualLoss,realizedSupplierLosses[id]);
    }

    function debtOf(bytes32 id,address account) public view returns(uint256){MarketState memory state=marketStates[id];(uint256 index,)=_previewIndexes(id,state);return debtSharesOf[id][account]*index/RAY;}
    function liquidityOf(bytes32 id,address account) public view returns(uint256){MarketState memory state=marketStates[id];(,uint256 index)=_previewIndexes(id,state);return liquiditySharesOf[id][account]*index/RAY;}
    function totalBorrow(bytes32 id) public view returns(uint256){MarketState memory state=marketStates[id];(uint256 index,)=_previewIndexes(id,state);return _totalDebt(state,index);}
    function totalLiquidity(bytes32 id) public view returns(uint256){MarketState memory state=marketStates[id];(,uint256 index)=_previewIndexes(id,state);return _totalSupply(state,index);}
    function badDebtOf(bytes32 id,address account) external view returns(uint256){MarketState memory state=marketStates[id];(uint256 index,)=_previewIndexes(id,state);return badDebtSharesOf[id][account]*index/RAY;}
    function availableLiquidity(bytes32 id) public view returns(uint256){return IERC20(registry.getMarket(id).debtAsset).balanceOf(address(this));}

    function _accrue(bytes32 id) private{
        MarketState memory state=marketStates[id];(uint128 oldBorrowIndex,uint128 oldSupplyIndex,)=interestIndex.indexStates(id);
        uint256 oldDebt=_totalDebt(state,oldBorrowIndex);uint256 oldSupply=_totalSupply(state,oldSupplyIndex);
        (uint256 newBorrowIndex,uint256 newSupplyIndex)=interestIndex.accrue(id,oldDebt,oldSupply);uint256 borrowerInterest=_totalDebt(state,newBorrowIndex)-oldDebt;uint256 supplierInterest=_totalSupply(state,newSupplyIndex)-oldSupply;
        uint256 reserveInterest=borrowerInterest>supplierInterest?borrowerInterest-supplierInterest:0;if(reserveInterest!=0)accruedReserves[id]+=reserveInterest;
        if(borrowerInterest!=0||supplierInterest!=0)emit MarketInterestAccrued(id,borrowerInterest,supplierInterest,reserveInterest);
    }
    function _previewIndexes(bytes32 id,MarketState memory state) private view returns(uint256,uint256){(uint128 borrowIndex,uint128 supplyIndex,)=interestIndex.indexStates(id);return interestIndex.preview(id,_totalDebt(state,borrowIndex),_totalSupply(state,supplyIndex));}
    function _borrowIndex(bytes32 id) private view returns(uint256 index){(index,,)=interestIndex.indexStates(id);}
    function _supplyIndex(bytes32 id) private view returns(uint256 index){(,index,)=interestIndex.indexStates(id);}
    function _totalDebt(MarketState memory state,uint256 index) private pure returns(uint256){return uint256(state.totalDebtShares)*index/RAY;}
    function _totalSupply(MarketState memory state,uint256 index) private pure returns(uint256){return uint256(state.totalSupplyShares)*index/RAY;}
    function _pullExact(address token,address from,uint256 amount) private{uint256 beforeBalance=IERC20(token).balanceOf(address(this));token.safeTransferFrom(from,address(this),amount);if(IERC20(token).balanceOf(address(this))!=beforeBalance+amount)revert InexactTransfer();}
    function _toUint128(uint256 value) private pure returns(uint128 result){result=uint128(value);if(result!=value)revert InvalidAmount();}
    function _ceilDiv(uint256 a,uint256 b) private pure returns(uint256){return a==0?0:(a-1)/b+1;}
    function _burnBadDebt(bytes32 id,address account,uint256 maxAmount) private returns(uint256 amount,uint256 shares){
        uint256 badShares=badDebtSharesOf[id][account];if(badShares==0)revert InvalidAmount();uint256 index=_borrowIndex(id);uint256 badAmount=badShares*index/RAY;
        shares=maxAmount>=badAmount?badShares:maxAmount*RAY/index;if(shares==0)revert InvalidAmount();amount=shares*index/RAY;
        badDebtSharesOf[id][account]=badShares-shares;totalBadDebtShares[id]-=shares;debtSharesOf[id][account]-=shares;marketStates[id].totalDebtShares-=uint128(shares);
    }
    function setLiquidationEngine(address newEngine) external onlyOwner{if(newEngine==address(0))revert ZeroAddress();emit LiquidationEngineUpdated(liquidationEngine,newEngine);liquidationEngine=newEngine;}
    function transferOwnership(address newOwner) external onlyOwner{if(newOwner==address(0))revert ZeroAddress();pendingOwner=newOwner;emit OwnershipTransferStarted(owner,newOwner);}
    function acceptOwnership() external{if(msg.sender!=pendingOwner)revert Unauthorized();address previous=owner;owner=msg.sender;pendingOwner=address(0);emit OwnershipTransferred(previous,msg.sender);}
}
