// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {IERC20} from "../interfaces/IERC20.sol";

interface ILQCLendingMarkets {
    struct MarketConfig {
        address collateralAsset;
        address debtAsset;
        uint8 collateralDecimals;
        uint8 debtDecimals;
        uint16 maxLtvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint128 supplyCap;
        uint128 borrowCap;
        uint128 minBorrow;
        bool enabled;
    }

    struct AccountRisk {
        uint256 collateralValue;
        uint256 debtValue;
        uint256 maxDebtValue;
        uint256 liquidationDebtValue;
        uint256 healthFactor;
        bool borrowAllowed;
        bool liquidatable;
    }

    function getMarket(bytes32 id) external view returns (MarketConfig memory);
    function validateCaps(bytes32 id, uint256 totalSupplyAfter, uint256 totalBorrowAfter) external view;
    function validateBorrowAmount(bytes32 id, uint256 accountDebtAfter) external view;
    function accountRisk(bytes32 id, uint256 collateralAmount, uint256 debtAmount)
        external view returns (AccountRisk memory);
}

/// @notice Minimal isolated-market custody and principal accounting for LQC Lending.
/// @dev Interest and liquidation are deliberately separate later stages.
contract LQCLendingCore {
    using SafeTransferLib for address;

    struct MarketState {
        uint128 totalCollateral;
        uint128 totalLiquidity;
        uint128 totalBorrow;
    }

    ILQCLendingMarkets public immutable registry;
    mapping(bytes32 marketId => MarketState) public marketStates;
    mapping(bytes32 marketId => mapping(address account => uint256)) public collateralOf;
    mapping(bytes32 marketId => mapping(address account => uint256)) public liquidityOf;
    mapping(bytes32 marketId => mapping(address account => uint256)) public debtOf;
    uint256 private unlocked = 1;

    event CollateralDeposited(bytes32 indexed marketId, address indexed account, uint256 amount);
    event CollateralWithdrawn(bytes32 indexed marketId, address indexed account, address indexed receiver, uint256 amount);
    event LiquiditySupplied(bytes32 indexed marketId, address indexed account, uint256 amount);
    event LiquidityWithdrawn(bytes32 indexed marketId, address indexed account, address indexed receiver, uint256 amount);
    event Borrowed(bytes32 indexed marketId, address indexed account, address indexed receiver, uint256 amount);
    event Repaid(bytes32 indexed marketId, address indexed payer, address indexed account, uint256 amount);

    error ZeroAddress();
    error InvalidAmount();
    error UnsafePosition();
    error InsufficientLiquidity();
    error InexactTransfer();
    error Reentrancy();

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = ILQCLendingMarkets(registry_);
    }

    function depositCollateral(bytes32 id, uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        ILQCLendingMarkets.MarketConfig memory config = registry.getMarket(id);
        MarketState storage state = marketStates[id];
        uint256 totalAfter = uint256(state.totalCollateral) + amount;
        registry.validateCaps(id, totalAfter, state.totalBorrow);
        _pullExact(config.collateralAsset, msg.sender, amount);
        state.totalCollateral = _toUint128(totalAfter);
        collateralOf[id][msg.sender] += amount;
        emit CollateralDeposited(id, msg.sender, amount);
    }

    function withdrawCollateral(bytes32 id, uint256 amount, address receiver) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (receiver == address(0)) revert ZeroAddress();
        uint256 collateralAfter = collateralOf[id][msg.sender] - amount;
        uint256 debt = debtOf[id][msg.sender];
        if (debt != 0 && !registry.accountRisk(id, collateralAfter, debt).borrowAllowed) revert UnsafePosition();
        ILQCLendingMarkets.MarketConfig memory config = registry.getMarket(id);
        collateralOf[id][msg.sender] = collateralAfter;
        marketStates[id].totalCollateral -= uint128(amount);
        config.collateralAsset.safeTransfer(receiver, amount);
        emit CollateralWithdrawn(id, msg.sender, receiver, amount);
    }

    function supplyLiquidity(bytes32 id, uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        ILQCLendingMarkets.MarketConfig memory config = registry.getMarket(id);
        registry.validateCaps(id, marketStates[id].totalCollateral, marketStates[id].totalBorrow);
        _pullExact(config.debtAsset, msg.sender, amount);
        marketStates[id].totalLiquidity = _toUint128(uint256(marketStates[id].totalLiquidity) + amount);
        liquidityOf[id][msg.sender] += amount;
        emit LiquiditySupplied(id, msg.sender, amount);
    }

    function withdrawLiquidity(bytes32 id, uint256 amount, address receiver) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (amount > availableLiquidity(id)) revert InsufficientLiquidity();
        ILQCLendingMarkets.MarketConfig memory config = registry.getMarket(id);
        liquidityOf[id][msg.sender] -= amount;
        marketStates[id].totalLiquidity -= uint128(amount);
        config.debtAsset.safeTransfer(receiver, amount);
        emit LiquidityWithdrawn(id, msg.sender, receiver, amount);
    }

    function borrow(bytes32 id, uint256 amount, address receiver) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (amount > availableLiquidity(id)) revert InsufficientLiquidity();
        MarketState storage state = marketStates[id];
        uint256 debtAfter = debtOf[id][msg.sender] + amount;
        uint256 totalBorrowAfter = uint256(state.totalBorrow) + amount;
        registry.validateCaps(id, state.totalCollateral, totalBorrowAfter);
        registry.validateBorrowAmount(id, debtAfter);
        if (!registry.accountRisk(id, collateralOf[id][msg.sender], debtAfter).borrowAllowed) revert UnsafePosition();
        ILQCLendingMarkets.MarketConfig memory config = registry.getMarket(id);
        debtOf[id][msg.sender] = debtAfter;
        state.totalBorrow = _toUint128(totalBorrowAfter);
        config.debtAsset.safeTransfer(receiver, amount);
        emit Borrowed(id, msg.sender, receiver, amount);
    }

    function repay(bytes32 id, uint256 amount, address account) external nonReentrant returns (uint256 repaid) {
        if (amount == 0) revert InvalidAmount();
        if (account == address(0)) revert ZeroAddress();
        uint256 debt = debtOf[id][account];
        repaid = amount < debt ? amount : debt;
        if (repaid == 0) revert InvalidAmount();
        uint256 debtAfter = debt - repaid;
        if (debtAfter != 0) registry.validateBorrowAmount(id, debtAfter);
        ILQCLendingMarkets.MarketConfig memory config = registry.getMarket(id);
        _pullExact(config.debtAsset, msg.sender, repaid);
        debtOf[id][account] = debtAfter;
        marketStates[id].totalBorrow -= uint128(repaid);
        emit Repaid(id, msg.sender, account, repaid);
    }

    function availableLiquidity(bytes32 id) public view returns (uint256) {
        MarketState memory state = marketStates[id];
        return uint256(state.totalLiquidity) - state.totalBorrow;
    }

    function _pullExact(address token, address from, uint256 amount) private {
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) != beforeBalance + amount) revert InexactTransfer();
    }

    function _toUint128(uint256 value) private pure returns (uint128 result) {
        result = uint128(value);
        if (result != value) revert InvalidAmount();
    }
}
