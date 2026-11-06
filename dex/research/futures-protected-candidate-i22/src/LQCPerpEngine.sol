// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCFuturesMarketRegistry} from "./LQCFuturesMarketRegistry.sol";
import {LQCFuturesVault} from "./LQCFuturesVault.sol";
import {FundingLedger} from './funding/FundingLedger.sol';
import {FundingWithdrawalVerifier} from './funding/FundingWithdrawalVerifier.sol';
import {FundingLedgerFactory} from './funding/FundingLedgerFactory.sol';
import {FuturesMathModule} from './modules/FuturesMathModule.sol';
import {LiquidationCalculator} from './modules/LiquidationCalculator.sol';
import {AdlCalculator} from './modules/AdlCalculator.sol';
import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";

/// @notice Isolated-margin perpetual engine for LQC Flow Futures.
/// @dev Master 7/5 substeps 1-5 add canonical reduction, conserved funding, segregated fees,
///      bounded Futures-only Insurance/residual-bad-debt accounting and bounded partial liquidation.
///      7/5-6 begins with an explicit bounded ADL safety boundary; execution is added only after this gate.
contract LQCPerpEngine {
    uint256 public constant BPS = 10_000;
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant FUNDING_RAY = 1e27;
    uint256 public constant MAX_FUNDING_DELTA_RAY = FUNDING_RAY;
    uint256 public constant MAX_ORACLE_DELAY = 5 minutes;

    struct Position {
        uint256 margin;
        uint256 sizeUsd;
        uint256 entryPrice;
        bool isLong;
        bool open;
    }

    struct FundingState {
        int256 cumulativeFundingPerUsdRay;
        uint256 maxAbsDeltaPerUpdateRay;
        bool configured;
    }

    LQCFuturesMarketRegistry public immutable registry;
    LQCFuturesVault public immutable vault;
    FundingLedgerFactory public immutable ledgerFactory;
    FuturesMathModule public immutable mathModule;LiquidationCalculator public immutable liquidationModule;AdlCalculator public immutable adlModule;

    mapping(address => mapping(uint256 => Position)) public positions;
    mapping(uint256 => FundingState) public fundingStates;
    mapping(address => mapping(uint256 => int256)) public positionFundingEntryRay;
    mapping(uint256 => uint256) public tradingFeeBps;
    mapping(uint256 => uint256) public insuranceFeeShareBps;
    mapping(uint256 => uint256) public maxInsuranceCoverageBps;
    mapping(uint256 => uint256) public liquidationReductionBps;
    mapping(uint256 => uint256) public liquidationMinRemainingSizeUsd;
    mapping(uint256 => uint256) public maxAdlReductionBps;
    mapping(uint256 => bool) public adlEnabled;
    mapping(uint256 => uint256) public maxPositionNotionalUsd;
    mapping(uint256 => uint256) public maxOrderNotionalUsd;
    mapping(uint256 => uint256) public maxOpenInterestUsd;
    mapping(uint256 => uint256) public openInterestUsd;

    // Append-only storage; survives position deletion and direction changes.
    mapping(address => mapping(uint256 => mapping(address => int256))) public fundingRemainderRay;
    FundingLedger public fundingLedger;
    bool public legacyActivity;
    mapping(bytes32=>uint256) public fundingNonce;
    struct FundingProof {uint256 nonce;int256 amount;}
    mapping(bytes32=>FundingProof) private fundingProofs;
    uint256 public constant MAX_FUNDING_MARKETS=16;
    bool public withdrawalProtectionEnabled;
    bool public fundingInventoryInitialized=true;
    bool public positionEverOpened;
    FundingWithdrawalVerifier public withdrawalVerifier;bytes32 private withdrawalVerifierHash;
    mapping(address=>mapping(address=>uint256[])) private activeFundingMarkets;
    mapping(address=>mapping(uint256=>uint256)) public fundingMarketIndex;
    mapping(address=>mapping(address=>uint256)) public fundingActiveCount;
    mapping(address=>mapping(address=>uint256)) public fundingActiveSize;
    mapping(address=>mapping(address=>bytes32)) public fundingMarketCommitment;
    mapping(address=>mapping(address=>uint256)) public negativeRemainderHolds;
    mapping(uint256=>bool) public protectedLiquidationCandidate;
    uint256 private liquidationEntered;
    mapping(uint256=>bool) public conditionalAdlCandidate;
    event ConditionalAdlCandidateConfigured(uint256 indexed market,bool enabled);
    event ProtectedLiquidationCandidateConfigured(uint256 indexed market,bool enabled);
    event ProtectedFundingRecovered(address indexed account,uint256 indexed market,address indexed token,uint256 availableDebit,uint256 marginDebit,uint256 unpaid,int256 remainderRay);
    error FundingProtectionInvalid();error FundingInventoryInvalid();error ProtectedReentrancy();
    event FundingWithdrawalProtectionEnabled(address indexed ledger);
    error LedgerBindingForbidden();error LedgerDebtOutstanding();error LedgerLiquidationNotIntegrated();
    event FundingLedgerBound(address indexed ledger);
    event FundingCrystallized(address indexed account,uint256 indexed market,address indexed token,uint256 nonce,int256 amount,int256 remainder,uint256 claimId);
    event LedgerCashMoved(address indexed account,address indexed token,int256 amount);
    event FundingRemainderStored(address indexed account,uint256 indexed marketId,address indexed collateral,int256 remainderRay);
    event FundingLiquidationBreakdown(address indexed account,uint256 indexed marketId,uint256 marginCredit,uint256 marginDebit,uint256 availableDebit,uint256 insuranceCovered,uint256 residual,int256 remainderRay);

    event PositionOpened(
        address indexed account,
        uint256 indexed marketId,
        bool isLong,
        uint256 margin,
        uint256 sizeUsd,
        uint256 entryPrice
    );
    event PositionReduced(
        address indexed account,
        uint256 indexed marketId,
        uint256 reducedSizeUsd,
        uint256 releasedMargin,
        uint256 remainingSizeUsd,
        uint256 remainingMargin,
        uint256 exitPrice,
        int256 realizedPnl
    );
    event PositionClosed(address indexed account, uint256 indexed marketId, uint256 exitPrice, int256 pnl);
    event PositionLiquidated(
        address indexed account,
        uint256 indexed marketId,
        address indexed liquidator,
        uint256 price,
        int256 pnl
    );
    event FundingConfigured(uint256 indexed marketId, uint256 maxAbsDeltaPerUpdateRay);
    event TradingFeeConfigured(uint256 indexed marketId, uint256 feeBps, uint256 insuranceShareBps);
    event TradingFeeCharged(address indexed account, uint256 indexed marketId, uint256 notionalUsd, uint256 fee, uint256 insuranceAmount);
    event InsuranceCoverageConfigured(uint256 indexed marketId, uint256 maxCoverageBps);
    event AdlSafetyConfigured(uint256 indexed marketId, bool enabled, uint256 maxReductionBps);
    event MarketNotionalLimitsConfigured(uint256 indexed marketId, uint256 maxPositionNotionalUsd, uint256 maxOrderNotionalUsd);
    event MarketOpenInterestLimitConfigured(uint256 indexed marketId, uint256 maxOpenInterestUsd);
    event PartialLiquidationConfigured(
        uint256 indexed marketId,
        uint256 reductionBps,
        uint256 minRemainingSizeUsd
    );
    event AdlExecuted(address indexed account, uint256 indexed marketId, uint256 reducedSizeUsd, uint256 absorbedBadDebt, uint256 remainingSizeUsd, uint256 price);
    event PositionPartiallyLiquidated(
        address indexed account,
        uint256 indexed marketId,
        address indexed liquidator,
        uint256 reducedSizeUsd,
        uint256 remainingSizeUsd,
        uint256 remainingMargin,
        uint256 price,
        int256 realizedPnl
    );
    event LiquidationFundingApplied(
        address indexed account,
        uint256 indexed marketId,
        int256 payment,
        uint256 marginCredit,
        uint256 marginDebit,
        uint256 insuranceCovered,
        uint256 residualBadDebt
    );
    event PositionDeficitRecorded(
        address indexed account,
        uint256 indexed marketId,
        uint256 deficit,
        uint256 insuranceCovered,
        uint256 residualBadDebt
    );
    event FundingIndexUpdated(
        uint256 indexed marketId,
        int256 previousIndexRay,
        int256 newIndexRay,
        int256 deltaRay
    );
    event FundingSettled(
        address indexed account,
        uint256 indexed marketId,
        int256 payment,
        int256 checkpointIndexRay
    );

    error Forbidden();
    error InvalidAmount();
    error InvalidReduction();
    error MarketInactive();
    error PositionExists();
    error PositionNotFound();
    error LeverageTooHigh();
    error InvalidOraclePrice();
    error StaleOraclePrice();
    error NotLiquidatable();
    error PartialReductionWouldCreateBadDebt();
    error FundingMarketNotFound();
    error FundingNotConfigured();
    error InvalidFundingBound();
    error InvalidFundingDelta();
    error FundingDeltaTooLarge();
    error FundingOverflow();
    error InvalidFeeConfiguration();
    error InvalidInsuranceConfiguration();
    error InvalidLiquidationConfiguration();
    error InvalidAdlConfiguration();
    error AdlNotEnabled();
    error AdlBadDebtRequired();
    error AdlPositionNotProfitable();
    error AdlReductionTooLarge();
    error InvalidNotionalLimits();
    error MaxOrderNotionalExceeded();
    error MaxPositionNotionalExceeded();
    error MaxOpenInterestExceeded();

    modifier onlyRegistryOwner() {
        _checkRegistryOwner();
        _;
    }

    function _checkRegistryOwner() private view {if(msg.sender!=registry.owner())revert Forbidden();}
    constructor(address registry_, address vault_) {
        if (registry_ == address(0) || vault_ == address(0)) revert InvalidAmount();
        registry = LQCFuturesMarketRegistry(registry_);
        vault = LQCFuturesVault(vault_);
        ledgerFactory=new FundingLedgerFactory(address(this));mathModule=new FuturesMathModule();liquidationModule=new LiquidationCalculator();adlModule=new AdlCalculator();
    }

    function configureMarketOpenInterestLimit(uint256 marketId, uint256 maxOpenInterest) external onlyRegistryOwner {
        if (!_marketExists(marketId) || maxOpenInterest == 0) revert InvalidNotionalLimits();
        if (maxOpenInterest < openInterestUsd[marketId]) revert InvalidNotionalLimits();
        maxOpenInterestUsd[marketId] = maxOpenInterest;
        emit MarketOpenInterestLimitConfigured(marketId, maxOpenInterest);
    }

    function configureMarketNotionalLimits(uint256 marketId, uint256 maxPositionUsd, uint256 maxOrderUsd) external onlyRegistryOwner {
        _requireFundingMarket(marketId);
        if (maxPositionUsd == 0 || maxOrderUsd == 0 || maxOrderUsd > maxPositionUsd) revert InvalidNotionalLimits();
        maxPositionNotionalUsd[marketId] = maxPositionUsd;
        maxOrderNotionalUsd[marketId] = maxOrderUsd;
        emit MarketNotionalLimitsConfigured(marketId, maxPositionUsd, maxOrderUsd);
    }

    /// @notice Configures the per-market Futures trading fee and its Insurance reserve share.
    /// @dev BPS values are bounded; Treasury receives the remainder. Reserve spending is deferred to later gates.
    function configureTradingFee(uint256 marketId, uint256 feeBps, uint256 insuranceShareBps_) external onlyRegistryOwner {
        _requireFundingMarket(marketId);
        if (feeBps > BPS || insuranceShareBps_ > BPS) revert InvalidFeeConfiguration();
        tradingFeeBps[marketId] = feeBps;
        insuranceFeeShareBps[marketId] = insuranceShareBps_;
        emit TradingFeeConfigured(marketId, feeBps, insuranceShareBps_);
    }

    modifier noProtectedVaultCallback(){_checkVaultCallback();_;}
    function _checkVaultCallback() private view {if(liquidationEntered!=0||(withdrawalProtectionEnabled&&vault.externalTransferInProgress()))revert ProtectedReentrancy();}
    function enableFundingWithdrawalProtection() external onlyRegistryOwner {
        if(withdrawalProtectionEnabled||positionEverOpened||address(fundingLedger)==address(0))revert FundingProtectionInvalid();
        withdrawalVerifier=FundingWithdrawalVerifier(ledgerFactory.createWithdrawalVerifier());withdrawalVerifierHash=address(withdrawalVerifier).codehash;
        withdrawalProtectionEnabled=true;_vaultCall(abi.encodeCall(LQCFuturesVault.enableFundingWithdrawalProtection,(address(fundingLedger))));emit FundingWithdrawalProtectionEnabled(address(fundingLedger));
    }
    function reserveOtherCollateral(address token,bytes32 reservationId,uint256 amount) external noProtectedVaultCallback {_vaultCall(abi.encodeCall(LQCFuturesVault.reserveCollateral,(msg.sender,token,reservationId,amount)));}
    function releaseOtherCollateral(address token,bytes32 reservationId) external noProtectedVaultCallback {_vaultCall(abi.encodeCall(LQCFuturesVault.releaseCollateralReservation,(msg.sender,token,reservationId)));}
    function fundingMarketLength(address account,address token) external view returns(uint256){return activeFundingMarkets[account][token].length;}
    function fundingMarketAt(address account,address token,uint256 index) external view returns(uint256){return activeFundingMarkets[account][token][index];}
    function _trackFundingMarket(address account,uint256 market,address token) private {
        uint256[] storage list=activeFundingMarkets[account][token];
        if(fundingMarketIndex[account][market]!=0||(withdrawalProtectionEnabled&&list.length>=MAX_FUNDING_MARKETS))revert FundingInventoryInvalid();
        list.push(market);fundingMarketIndex[account][market]=list.length;fundingMarketCommitment[account][token]^=keccak256(abi.encode(account,token,market));
    }
    function _untrackFundingMarket(address account,uint256 market,address token) private {
        uint256[] storage list=activeFundingMarkets[account][token];uint256 index=fundingMarketIndex[account][market];
        if(index==0||index>list.length||list[index-1]!=market)revert FundingInventoryInvalid();
        uint256 last=list[list.length-1];list[index-1]=last;fundingMarketIndex[account][last]=index;list.pop();delete fundingMarketIndex[account][market];fundingMarketCommitment[account][token]^=keccak256(abi.encode(account,token,market));
    }
    function previewFundingDomain(address account,uint256 market,address token) external view returns(int256,int256){return _fundingAmounts(account,market,token,positions[account][market].sizeUsd,positions[account][market].isLong);}
    function fundingProtectionReady() external view returns(bool){return withdrawalProtectionEnabled&&address(fundingLedger)!=address(0)&&address(withdrawalVerifier).codehash==withdrawalVerifierHash&&withdrawalVerifier.bindingsValid();}
    function fundingWithdrawalRequirement(address account,address token) external view returns(uint256){if(!withdrawalProtectionEnabled||address(withdrawalVerifier).codehash!=withdrawalVerifierHash)revert FundingProtectionInvalid();return withdrawalVerifier.required(account,token);}
    /// Fresh-instance opt-in only; historical initialized state cannot silently migrate.
    function createFundingLedger(uint256 epochBlocks) external onlyRegistryOwner returns(address) {
        if(address(fundingLedger)!=address(0)||legacyActivity)revert LedgerBindingForbidden();
        fundingLedger=FundingLedger(ledgerFactory.create(epochBlocks));emit FundingLedgerBound(address(fundingLedger));return address(fundingLedger);
    }
    function engine() external view returns(address){return address(this);}
    function fundingCheckpoint(address account,uint256 market,address token,uint256 nonce) external view returns(int256,bool){
        FundingProof memory proof=fundingProofs[keccak256(abi.encode(account,market,token))];return(proof.amount,proof.nonce==nonce&&nonce!=0);
    }
    modifier onlyFundingLedger(){if(msg.sender!=address(fundingLedger)||msg.sender==address(0))revert Forbidden();_;}
    function collect(address account,uint256 market,address token,uint256 amount) external onlyFundingLedger {
        address collateral=registry.marketCollateral(market);if(!_marketExists(market)||collateral!=token||amount>uint256(type(int256).max))revert InvalidAmount();
        _settleFunding(account,token,-int256(amount));_emitFundingSettled(account,market,-int256(amount),fundingStates[market].cumulativeFundingPerUsdRay);emit LedgerCashMoved(account,token,-int256(amount));
    }
    function pay(address account,address token,uint256 amount) external onlyFundingLedger {
        if(amount>uint256(type(int256).max))revert FundingOverflow();_settleFunding(account,token,int256(amount));emit LedgerCashMoved(account,token,int256(amount));
    }
    function _requireNoLedgerDebt(address account,address token) private view {
        if(address(fundingLedger)!=address(0)&&fundingLedger.accountPayable(account,token)!=0)revert LedgerDebtOutstanding();
    }
    function _ledgerCheckpoint(address account,uint256 market,address token,Position memory position) private returns(int256 cash){
        _crystallizeFunding(account,market,token,position);bytes32 k=keccak256(abi.encode(account,market,token));
        uint256 due=fundingLedger.payableAmount(k);uint256 available=vault.fundingCollectible(account,token);uint256 n=due<available?due:available;
        if(n!=0){_collectFunding(account,market,token,n);cash=-int256(n);}
    }

    function _crystallizeFunding(address account,uint256 market,address token,Position memory position) private {

        (int256 amount,int256 remainder)=_fundingAmounts(account,market,token,position.sizeUsd,position.isLong);bytes32 k=keccak256(abi.encode(account,market,token));uint256 nonce=++fundingNonce[k];fundingProofs[k]=FundingProof(nonce,amount);
        _commitFunding(account,market,token,remainder,fundingStates[market].cumulativeFundingPerUsdRay);
        uint256 id=_ledgerCall(abi.encodeCall(FundingLedger.crystallize,(account,market,token,nonce)),true);emit FundingCrystallized(account,market,token,nonce,amount,remainder,id);
    }

    /// @notice Configures the emergency ADL safety boundary only; this does not execute ADL.
    /// @dev ADL must be explicitly enabled by Governance and is capped per execution.
    ///      A nonzero residual Futures bad-debt condition is required by the execution gate added next.
    function configureAdlSafety(uint256 marketId, bool enabled, uint256 maxReductionBps) external onlyRegistryOwner {
        _requireFundingMarket(marketId);
        if (enabled && (maxReductionBps == 0 || maxReductionBps > BPS)) revert InvalidAdlConfiguration();
        if (!enabled && maxReductionBps != 0) revert InvalidAdlConfiguration();
        adlEnabled[marketId] = enabled;
        maxAdlReductionBps[marketId] = maxReductionBps;
        emit AdlSafetyConfigured(marketId, enabled, maxReductionBps);
    }

    /// @notice Returns true only when Governance enabled ADL and unresolved Futures bad debt exists.
    function isAdlEmergencyActive(uint256 marketId, address collateralToken) public view returns (bool) {
        if (!_marketExists(marketId)) return false;
        return adlEnabled[marketId] && maxAdlReductionBps[marketId] != 0 && vault.residualBadDebt(collateralToken) != 0;
    }

    /// @notice Executes a Governance-only, bounded ADL reduction against explicit residual Futures bad debt.
    /// @dev This primitive cannot create new debt: only profitable position slices may absorb existing residual debt.
    function executeAdl(address account, uint256 marketId, uint256 reduceSizeUsd) external onlyRegistryOwner noProtectedVaultCallback liquidationLock {
        if (!adlEnabled[marketId]) revert AdlNotEnabled();
        Position storage stored = positions[account][marketId];
        if (!stored.open) revert PositionNotFound();
        if (reduceSizeUsd == 0 || reduceSizeUsd > stored.sizeUsd) revert InvalidReduction();

        (, address indexToken, address collateralToken, address oracle,,,) = _market(marketId);
        bool conditional=conditionalAdlCandidate[marketId];
        if(conditional||withdrawalProtectionEnabled)_requireProtectedMarket(marketId);
        uint256 debt = vault.residualBadDebt(collateralToken);
        if (debt == 0) revert AdlBadDebtRequired();

        uint256 cap = stored.sizeUsd * maxAdlReductionBps[marketId] / BPS;
        if (cap == 0 || reduceSizeUsd > cap) revert AdlReductionTooLarge();

        uint256 price = _price(indexToken, oracle);
        (uint256 releasedMargin,uint256 absorbed)=adlModule.plan(stored.margin,stored.sizeUsd,stored.entryPrice,stored.isLong,reduceSizeUsd,debt,price);

        uint256 fundingDebit;
        if(conditional){_crystallizeFunding(account,marketId,collateralToken,stored);fundingDebit=adlModule.conditionalCollection(address(this),account,marketId,reduceSizeUsd,releasedMargin);}
        else{_settleFundingCheckpoint(account,marketId,collateralToken,stored);_requireNoLedgerDebt(account,collateralToken);}

        stored.sizeUsd -= reduceSizeUsd;
        _decreaseSize(account,marketId,collateralToken,reduceSizeUsd);
        stored.margin -= releasedMargin;
        _unlockCollateral(account, collateralToken, releasedMargin);
        if(conditional){if(fundingDebit!=0)_collectFunding(account,marketId,collateralToken,fundingDebit);_requireNoLedgerDebt(account,collateralToken);}
        _vaultCall(abi.encodeCall(LQCFuturesVault.absorbAdlBadDebt,(collateralToken, absorbed)));

        if (stored.sizeUsd == 0) {
            _deletePosition(account,marketId,collateralToken);
        }
        emit AdlExecuted(account, marketId, reduceSizeUsd, absorbed, stored.sizeUsd, price);
    }

    /// @notice Configures the bounded partial-liquidation step for a market.
    /// @dev A zero stored reduction means legacy full liquidation. Governance may configure
    ///      1..10000 bps. minRemainingSizeUsd may be zero to disable dust promotion.
    function configurePartialLiquidation(
        uint256 marketId,
        uint256 reductionBps,
        uint256 minRemainingSizeUsd
    ) external onlyRegistryOwner {
        _requireFundingMarket(marketId);
        if (reductionBps == 0 || reductionBps > BPS) revert InvalidLiquidationConfiguration();

        liquidationReductionBps[marketId] = reductionBps;
        liquidationMinRemainingSizeUsd[marketId] = minRemainingSizeUsd;
        emit PartialLiquidationConfigured(marketId, reductionBps, minRemainingSizeUsd);
    }

    /// @notice Configures the maximum fraction of a realized deficit that Insurance may cover.
    /// @dev This is a Governance-supplied bound, not a hard-coded product value.
    ///      Available Insurance reserve remains the global physical coverage ceiling.
    function configureInsuranceCoverage(uint256 marketId, uint256 maxCoverageBps) external onlyRegistryOwner {
        _requireFundingMarket(marketId);
        if (maxCoverageBps > BPS) revert InvalidInsuranceConfiguration();
        maxInsuranceCoverageBps[marketId] = maxCoverageBps;
        emit InsuranceCoverageConfigured(marketId, maxCoverageBps);
    }

    /// @notice Sets the per-market maximum absolute funding-index change accepted per update.
    /// @dev No product funding rate is hard-coded here. Governance supplies a market-specific bound.
    ///      FUNDING_RAY is only a protocol safety ceiling of 100% per update, not an approved economic rate.
    function configureFunding(uint256 marketId, uint256 maxAbsDeltaPerUpdateRay) external onlyRegistryOwner {
        _requireFundingMarket(marketId);
        if (maxAbsDeltaPerUpdateRay == 0 || maxAbsDeltaPerUpdateRay > MAX_FUNDING_DELTA_RAY) {
            revert InvalidFundingBound();
        }

        FundingState storage state = fundingStates[marketId];
        state.maxAbsDeltaPerUpdateRay = maxAbsDeltaPerUpdateRay;
        state.configured = true;
        emit FundingConfigured(marketId, maxAbsDeltaPerUpdateRay);
    }

    /// @notice Advances the cumulative funding index after a fresh market-oracle check.
    /// @dev Positive delta means longs pay shorts; negative delta means shorts pay longs.
    function updateFundingIndex(uint256 marketId, int256 deltaRay) external onlyRegistryOwner {
        if(address(fundingLedger)==address(0))legacyActivity=true;
        FundingState storage state = fundingStates[marketId];
        if (!state.configured) revert FundingNotConfigured();
        if (deltaRay == 0 || deltaRay == type(int256).min) revert InvalidFundingDelta();

        uint256 absDelta = uint256(deltaRay < 0 ? -deltaRay : deltaRay);
        if (absDelta > state.maxAbsDeltaPerUpdateRay) revert FundingDeltaTooLarge();

        (, address indexToken,, address oracle,,,) = _market(marketId);
        _price(indexToken, oracle);

        int256 previous = state.cumulativeFundingPerUsdRay;
        int256 next = previous + deltaRay;
        state.cumulativeFundingPerUsdRay = next;
        emit FundingIndexUpdated(marketId, previous, next, deltaRay);
    }

    function openPosition(uint256 marketId, uint256 margin, uint256 sizeUsd, bool isLong) external noProtectedVaultCallback {
        if(!_isRiskEngine())revert FundingProtectionInvalid();
        if(address(fundingLedger)==address(0))legacyActivity=true;
        if (margin == 0 || sizeUsd == 0) revert InvalidAmount();
        uint256 orderLimit = maxOrderNotionalUsd[marketId];
        uint256 positionLimit = maxPositionNotionalUsd[marketId];
        if (orderLimit != 0 && sizeUsd > orderLimit) revert MaxOrderNotionalExceeded();
        if (positionLimit != 0 && sizeUsd > positionLimit) revert MaxPositionNotionalExceeded();
        uint256 oiLimit = maxOpenInterestUsd[marketId];
        if (oiLimit != 0 && openInterestUsd[marketId] + sizeUsd > oiLimit) revert MaxOpenInterestExceeded();
        Position storage existing = positions[msg.sender][marketId];
        if (existing.open) revert PositionExists();

        (
            ,
            address indexToken,
            address collateralToken,
            address oracle,
            uint32 maxLeverageBps,
            ,
            bool active
        ) = _market(marketId);

        _requireNoLedgerDebt(msg.sender,collateralToken);
        if (!active || registry.marketMode(marketId) != LQCFuturesMarketRegistry.MarketMode.ACTIVE) revert MarketInactive();
        if (sizeUsd * BPS > margin * uint256(maxLeverageBps)) revert LeverageTooHigh();

        uint256 price = _price(indexToken, oracle);
        if(!registry.liquidationReady(marketId))revert FundingProtectionInvalid();
        _vaultCall(abi.encodeCall(LQCFuturesVault.lockCollateral,(msg.sender, collateralToken, margin)));
        _chargeTradingFee(msg.sender, marketId, collateralToken, sizeUsd);

        positions[msg.sender][marketId] =
            Position({margin: margin, sizeUsd: sizeUsd, entryPrice: price, isLong: isLong, open: true});
        positionEverOpened=true;fundingActiveCount[msg.sender][collateralToken]++;fundingActiveSize[msg.sender][collateralToken]+=sizeUsd;_trackFundingMarket(msg.sender,marketId,collateralToken);
        openInterestUsd[marketId] += sizeUsd;
        positionFundingEntryRay[msg.sender][marketId] = fundingStates[marketId].cumulativeFundingPerUsdRay;

        emit PositionOpened(msg.sender, marketId, isLong, margin, sizeUsd, price);
    }

    /// @notice Settles the caller's funding cash against the dedicated Futures funding pool.
    /// @dev Negative payment debits available balance; positive payment consumes previously collected pool funds.
    function settleFunding(uint256 marketId) external noProtectedVaultCallback returns (int256 payment) {
        Position memory position = positions[msg.sender][marketId];
        if (!position.open) revert PositionNotFound();
        (,, address collateralToken,,,,) = _market(marketId);
        payment = _settleFundingCheckpoint(msg.sender, marketId, collateralToken, position);
    }

    function previewFundingPayment(address account,uint256 marketId) public view returns(int256 payment) {
        Position memory position=positions[account][marketId];
        if(!position.open) revert PositionNotFound();
        (,,address collateral,,,,)=_market(marketId);
        (payment,)=_fundingAmounts(account,marketId,collateral,position.sizeUsd,position.isLong);
    }

    function _fundingAmounts(address account,uint256 marketId,address collateral,uint256 size,bool isLong) private view returns(int256 payment,int256 remainder) {
        FundingState storage state=fundingStates[marketId];return mathModule.funding(size,isLong,fundingRemainderRay[account][marketId][collateral],state.configured,state.cumulativeFundingPerUsdRay,positionFundingEntryRay[account][marketId]);
    }

    function _commitFunding(address account,uint256 marketId,address collateral,int256 remainder,int256 index) private {
        int256 previous=fundingRemainderRay[account][marketId][collateral];
        if(previous<0)negativeRemainderHolds[account][collateral]-=1;if(remainder<0)negativeRemainderHolds[account][collateral]+=1;
        fundingRemainderRay[account][marketId][collateral]=remainder;
        positionFundingEntryRay[account][marketId]=index;
        emit FundingRemainderStored(account,marketId,collateral,remainder);
    }

    /// @notice Reduces part or all of the caller's position at the current Oracle price.
    /// @dev Outstanding voluntary funding is settled before size changes, preventing funding evasion.
    function reducePosition(uint256 marketId, uint256 reduceSizeUsd)
        external
        noProtectedVaultCallback
        returns (uint256 releasedMargin, int256 realizedPnl, uint256 exitPrice)
    {
        (releasedMargin, realizedPnl, exitPrice,) = _reducePosition(msg.sender, marketId, reduceSizeUsd);
    }

    function closePosition(uint256 marketId) external noProtectedVaultCallback {
        Position memory position = positions[msg.sender][marketId];
        if (!position.open) revert PositionNotFound();

        (, int256 pnl, uint256 price, uint256 remainingSize) =
            _reducePosition(msg.sender, marketId, position.sizeUsd);

        if (remainingSize != 0) revert InvalidReduction();
        emit PositionClosed(msg.sender, marketId, price, pnl);
    }

    /// Isolated candidate switch, default OFF. Governance must revoke recovery approval before changing it.
    function configureProtectedLiquidationCandidate(uint256 market,bool enabled)external onlyRegistryOwner {
        liquidationModule.requireCandidateChange(address(this),market);
        protectedLiquidationCandidate[market]=enabled;emit ProtectedLiquidationCandidateConfigured(market,enabled);
    }
    /// Existing debt service also works after a full liquidation; claims are not position-dependent.
    function repayFundingDebt(uint256 market,uint256 amount)external noProtectedVaultCallback {
        if(address(fundingLedger)==address(0))revert FundingProtectionInvalid();_collectFunding(msg.sender,market,registry.marketCollateral(market),amount);
    }
    modifier liquidationLock(){if(liquidationEntered!=0)revert ProtectedReentrancy();liquidationEntered=1;_;liquidationEntered=0;}
    function liquidate(address account,uint256 marketId)external noProtectedVaultCallback liquidationLock {
        bool protected_=address(fundingLedger)!=address(0);
        if(protected_&&!protectedLiquidationCandidate[marketId])revert LedgerLiquidationNotIntegrated();
        Position storage stored=positions[account][marketId];if(!stored.open)revert PositionNotFound();
        (,address indexToken,address collateral,address oracle,,,)=_market(marketId);
        if(protected_){_requireProtectedMarket(marketId);_crystallizeFunding(account,marketId,collateral,stored);}
        else stored.margin=_settleLiquidationFundingCheckpoint(account,marketId,collateral,stored);
        uint256 price=_price(indexToken,oracle);uint256 margin=stored.margin;
        LiquidationCalculator.Plan memory p=liquidationModule.liquidationPlan(address(this),account,marketId,price,protected_);
        _decreaseSize(account,marketId,collateral,p.reduce);
        if(p.full){_deletePosition(account,marketId,collateral);_settle(account,marketId,collateral,margin,p.pnl);}
        else{stored.sizeUsd=p.remainingSize;stored.margin=p.remainingMargin;if(p.pnl!=0)_settlePnL(account,collateral,p.pnl);}
        if(protected_)_recoverLiquidationFunding(account,marketId,collateral,price);
        if(p.full)emit PositionLiquidated(account,marketId,msg.sender,price,p.pnl);
        else{emit PositionReduced(account,marketId,p.reduce,0,p.remainingSize,stored.margin,price,p.pnl);emit PositionPartiallyLiquidated(account,marketId,msg.sender,p.reduce,p.remainingSize,stored.margin,price,p.pnl);}
    }
    function _recoverLiquidationFunding(address account,uint256 market,address token,uint256 price)private{
        (uint256 a,uint256 m,uint256 due)=liquidationModule.recoveryPlan(address(this),account,market,price);
        if(m!=0){positions[account][market].margin-=m;_unlockCollateral(account,token,m);}
        if(a+m!=0)_collectFunding(account,market,token,a+m);
        emit ProtectedFundingRecovered(account,market,token,a,m,due-a-m,fundingRemainderRay[account][market][token]);
    }


    function getPositionPnl(address account, uint256 marketId)
        external
        view
        returns (int256 pnl, uint256 markPrice)
    {
        Position memory position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();

        (, address indexToken,, address oracle,,,) = _market(marketId);
        markPrice = _price(indexToken, oracle);
        pnl = _pnl(position, markPrice);
    }

    function _reducePosition(address account, uint256 marketId, uint256 reduceSizeUsd)
        private
        returns (uint256 releasedMargin, int256 realizedPnl, uint256 exitPrice, uint256 remainingSizeUsd)
    {
        Position storage stored = positions[account][marketId];
        if (!stored.open) revert PositionNotFound();

        Position memory beforePosition = stored;
        if (reduceSizeUsd == 0 || reduceSizeUsd > beforePosition.sizeUsd) revert InvalidReduction();

        (, address indexToken, address collateralToken, address oracle,,,) = _market(marketId);

        _settleFundingCheckpoint(account, marketId, collateralToken, beforePosition);
        _requireNoLedgerDebt(account,collateralToken);
        exitPrice = _price(indexToken, oracle);

        releasedMargin = beforePosition.margin * reduceSizeUsd / beforePosition.sizeUsd;
        if (releasedMargin == 0) revert InvalidReduction();

        Position memory reducedSlice = Position({
            margin: releasedMargin,
            sizeUsd: reduceSizeUsd,
            entryPrice: beforePosition.entryPrice,
            isLong: beforePosition.isLong,
            open: true
        });
        realizedPnl = _pnl(reducedSlice, exitPrice);

        uint256 remainingMargin;
        if (reduceSizeUsd != beforePosition.sizeUsd) {
            if (int256(releasedMargin) + realizedPnl <= 0) revert PartialReductionWouldCreateBadDebt();
            remainingSizeUsd = beforePosition.sizeUsd - reduceSizeUsd;
            remainingMargin = beforePosition.margin - releasedMargin;
            if (remainingSizeUsd == 0 || remainingMargin == 0) revert InvalidReduction();
            stored.sizeUsd = remainingSizeUsd;
            stored.margin = remainingMargin;
        } else {
            _deletePosition(account,marketId,collateralToken);
        }
        _decreaseSize(account,marketId,collateralToken,reduceSizeUsd);
        _settle(account, marketId, collateralToken, releasedMargin, realizedPnl);
        _chargeTradingFee(account, marketId, collateralToken, reduceSizeUsd);
        emit PositionReduced(account,marketId,reduceSizeUsd,releasedMargin,remainingSizeUsd,remainingMargin,exitPrice,realizedPnl);
    }

    function _liquidationReductionSize(uint256 marketId, uint256 positionSizeUsd)
        private
        view
        returns (uint256 reduceSizeUsd)
    {
        return liquidationModule.reduction(positionSizeUsd,liquidationReductionBps[marketId],liquidationMinRemainingSizeUsd[marketId]);
    }

    function _settleLiquidationFundingCheckpoint(
        address account,
        uint256 marketId,
        address collateralToken,
        Position memory position
    ) private returns (uint256 adjustedMargin) {
        FundingState memory state = fundingStates[marketId];
        adjustedMargin = position.margin;

        if (!state.configured) {
            positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
            return adjustedMargin;
        }

        (int256 payment,int256 nextRemainder) = _fundingAmounts(account,marketId,collateralToken,position.sizeUsd,position.isLong);
        if (payment == 0) {
            _commitFunding(account,marketId,collateralToken,nextRemainder,state.cumulativeFundingPerUsdRay);
            _emitFundingSettled(account, marketId, 0, state.cumulativeFundingPerUsdRay);
            return adjustedMargin;
        }

        uint256 maxCoverage=liquidationModule.legacyCoverage(position.margin,vault.availableBalance(account,collateralToken),payment,maxInsuranceCoverageBps[marketId]);

        (
            uint256 marginCredit,
            uint256 marginDebit,
            uint256 insuranceCovered,
            uint256 residual
        ) = _vaultInvoke(abi.encodeCall(LQCFuturesVault.settleLiquidationFunding,(account,collateralToken,payment,position.margin,maxCoverage)),4);

        uint256 availableDebit=liquidationModule.validateLegacyReceipt(payment,marginCredit,marginDebit,insuranceCovered,residual);
        emit FundingLiquidationBreakdown(account,marketId,marginCredit,marginDebit,availableDebit,insuranceCovered,residual,nextRemainder);
        adjustedMargin = position.margin + marginCredit - marginDebit;
        _commitFunding(account,marketId,collateralToken,nextRemainder,state.cumulativeFundingPerUsdRay);

        _emitFundingSettled(account, marketId, payment, state.cumulativeFundingPerUsdRay);
        emit LiquidationFundingApplied(
            account,
            marketId,
            payment,
            marginCredit,
            marginDebit,
            insuranceCovered,
            residual
        );
    }

    function _chargeTradingFee(address account, uint256 marketId, address collateralToken, uint256 notionalUsd) private {
        uint256 feeBps = tradingFeeBps[marketId];
        if (feeBps == 0) return;
        if (notionalUsd > type(uint256).max / feeBps) revert InvalidAmount();
        uint256 fee = notionalUsd * feeBps / BPS;
        if (fee == 0) return;
        uint256 insuranceAmount = fee * insuranceFeeShareBps[marketId] / BPS;
        _vaultCall(abi.encodeCall(LQCFuturesVault.collectTradingFee,(account, collateralToken, fee, insuranceAmount)));
        emit TradingFeeCharged(account, marketId, notionalUsd, fee, insuranceAmount);
    }

    function _settleFundingCheckpoint(
        address account,
        uint256 marketId,
        address collateralToken,
        Position memory position
    ) private returns (int256 payment) {
        if(address(fundingLedger)!=address(0))return _ledgerCheckpoint(account,marketId,collateralToken,position);
        legacyActivity=true;
        FundingState memory state = fundingStates[marketId];
        if (!state.configured) {
            positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
            return 0;
        }

        int256 nextRemainder;
        (payment,nextRemainder) = _fundingAmounts(account,marketId,collateralToken,position.sizeUsd,position.isLong);
        if (payment != 0) _settleFunding(account, collateralToken, payment);

        _commitFunding(account,marketId,collateralToken,nextRemainder,state.cumulativeFundingPerUsdRay);
        _emitFundingSettled(account, marketId, payment, state.cumulativeFundingPerUsdRay);
    }

    function _settle(address account, uint256 marketId, address collateralToken, uint256 margin, int256 pnl) private {
        if (pnl >= 0) {
            if (margin != 0) _unlockCollateral(account, collateralToken, margin);
            if (pnl > 0) _settlePnL(account, collateralToken, pnl);
            return;
        }

        uint256 loss = uint256(-pnl);
        if (loss < margin) {
            _settlePnL(account, collateralToken, -int256(loss));
            _unlockCollateral(account, collateralToken, margin - loss);
            return;
        }

        _settlePnL(account, collateralToken, -int256(margin));
        uint256 deficit = loss - margin;
        if (deficit == 0) return;

        uint256 coverageBps = maxInsuranceCoverageBps[marketId];
        if (coverageBps != 0 && deficit > type(uint256).max / coverageBps) revert InvalidAmount();
        uint256 maxCoverage = deficit * coverageBps / BPS;
        (uint256 covered, uint256 residual,,) = _vaultInvoke(abi.encodeCall(LQCFuturesVault.coverBadDebt,(collateralToken,deficit,maxCoverage)),2);

        emit PositionDeficitRecorded(account, marketId, deficit, covered, residual);
    }

    function _pnl(Position memory position, uint256 price) private view returns (int256) {
        return mathModule.pnl(position.sizeUsd,position.entryPrice,position.isLong,price);
    }



    /// Fixed Vault only. Typed private selectors; exact revert and minimum return length preserved.
    function _vaultCall(bytes memory input)private{_vaultInvoke(input,0);}
    function _vaultInvoke(bytes memory input,uint256 words)private returns(uint256 a,uint256 b,uint256 c,uint256 d){
        address target=address(vault);
        assembly("memory-safe"){
            if iszero(extcodesize(target)){revert(0,0)}
            if iszero(call(gas(),target,0,add(input,32),mload(input),0,0)){
                let p:=mload(0x40)
                returndatacopy(p,0,returndatasize())
                revert(p,returndatasize())
            }
            let n:=mul(words,32)
            if lt(returndatasize(),n){revert(0,0)}
            if n {
                let p:=mload(0x40)
                returndatacopy(p,0,n)
                a:=mload(p)
                b:=mload(add(p,32))
                c:=mload(add(p,64))
                d:=mload(add(p,96))
                mstore(0x40,add(p,128))
            }
        }
    }
    /// Canonical factory-bound Ledger only; typed private call sites, no public dispatch.
    function _ledgerCall(bytes memory input,bool returnsWord) private returns(uint256 result){
        address target=address(fundingLedger);
        assembly ("memory-safe") {
            if iszero(extcodesize(target)){revert(0,0)}
            if iszero(call(gas(),target,0,add(input,32),mload(input),0,0)){
                let p:=mload(0x40)
                returndatacopy(p,0,returndatasize())
                revert(p,returndatasize())
            }
            if returnsWord {
                if lt(returndatasize(),32){revert(0,0)}
                returndatacopy(0,0,32)
                result:=mload(0)
            }
        }
    }
    function _decreaseSize(address account,uint256 market,address token,uint256 n)private{openInterestUsd[market]-=n;fundingActiveSize[account][token]-=n;}
    function _deletePosition(address account,uint256 market,address token) private {
        fundingActiveCount[account][token]--;
        _untrackFundingMarket(account,market,token);
        delete positions[account][market];
        delete positionFundingEntryRay[account][market];
    }
    function _requireFundingMarket(uint256 market)private view{if(!_marketExists(market))revert FundingMarketNotFound();}
    function _emitFundingSettled(address account,uint256 market,int256 payment,int256 checkpoint)private{emit FundingSettled(account,market,payment,checkpoint);}
    function _unlockCollateral(address account,address token,uint256 n)private{_vaultCall(abi.encodeCall(LQCFuturesVault.unlockCollateral,(account,token,n)));}
    function _settlePnL(address account,address token,int256 n)private{_vaultCall(abi.encodeCall(LQCFuturesVault.settlePnL,(account,token,n)));}
    function _settleFunding(address account,address token,int256 n)private{_vaultCall(abi.encodeCall(LQCFuturesVault.settleFunding,(account,token,n)));}
    function _collectFunding(address account,uint256 market,address token,uint256 amount)private{_ledgerCall(abi.encodeCall(FundingLedger.collect,(account,market,token,amount)),false);}
    function _marketExists(uint256 market)private view returns(bool){return market!=0&&market<=registry.marketCount();}
    function _isRiskEngine()private view returns(bool){return registry.riskEngine()==address(this);}
    /// Review candidate only, default OFF; no activation on a live market or pending recovery approval.
    function configureConditionalAdlCandidate(uint256 market,bool enabled)external onlyRegistryOwner{
        if(!withdrawalProtectionEnabled)revert FundingProtectionInvalid();
        liquidationModule.requireCandidateChange(address(this),market);
        conditionalAdlCandidate[market]=enabled;emit ConditionalAdlCandidateConfigured(market,enabled);
    }
    function _requireProtectedMarket(uint256 marketId)private view{
        try registry.verifiedResidualDebt(marketId) returns(bool verified,uint256){if(!verified||!_isRiskEngine())revert FundingProtectionInvalid();}catch{revert FundingProtectionInvalid();}
        liquidationModule.requireProtectedSource(address(this),marketId);
    }
    function _market(uint256 id) private view returns(bytes32,address,address,address,uint32,uint32,bool){return registry.markets(id);}
    function _price(address indexToken, address oracle) private view returns (uint256 price) {
        uint256 updatedAt;
        (price, updatedAt) = ILQCFuturesOracle(oracle).getPrice(indexToken);
        if (price == 0 || updatedAt > block.timestamp) revert InvalidOraclePrice();
        if (block.timestamp - updatedAt > MAX_ORACLE_DELAY) revert StaleOraclePrice();
    }
}
