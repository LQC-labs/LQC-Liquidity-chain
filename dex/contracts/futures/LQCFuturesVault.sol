// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

/// @notice Collateral custody and accounting for LQC Flow Futures.
/// @dev Only an authorized engine may lock/unlock collateral or settle PnL.
contract LQCFuturesVault {
    using SafeTransferLib for address;

    address public owner;
    address public pendingOwner;
    address public engine;
    uint256 private unlocked = 1;

    mapping(address => bool) public supportedCollateral;
    mapping(address => mapping(address => uint256)) public availableBalance;
    mapping(address => mapping(address => uint256)) public lockedBalance;
    mapping(address => uint256) public totalAccounted;

    event Deposit(address indexed account, address indexed token, uint256 amount);
    event Withdrawal(address indexed account, address indexed token, uint256 amount);
    event CollateralLocked(address indexed account, address indexed token, uint256 amount);
    event CollateralUnlocked(address indexed account, address indexed token, uint256 amount);
    event PnLSettled(address indexed account, address indexed token, int256 pnl);
    event CollateralSupportChanged(address indexed token, bool supported);
    event EngineChanged(address indexed previousEngine, address indexed newEngine);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error UnsupportedCollateral();
    error InvalidAmount();
    error InsufficientAvailableBalance();
    error InsufficientLockedBalance();
    error InsufficientVaultLiquidity();
    error Locked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier onlyEngine() {
        if (msg.sender != engine) revert Forbidden();
        _;
    }

    modifier lock() {
        if (unlocked != 1) revert Locked();
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function setEngine(address newEngine) external onlyOwner {
        if (newEngine == address(0)) revert ZeroAddress();
        address previous = engine;
        engine = newEngine;
        emit EngineChanged(previous, newEngine);
    }

    function setSupportedCollateral(address token, bool supported) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        supportedCollateral[token] = supported;
        emit CollateralSupportChanged(token, supported);
    }

    function deposit(address token, uint256 amount) external lock {
        if (!supportedCollateral[token]) revert UnsupportedCollateral();
        if (amount == 0) revert InvalidAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        availableBalance[msg.sender][token] += amount;
        totalAccounted[token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external lock {
        if (amount == 0) revert InvalidAmount();
        uint256 available = availableBalance[msg.sender][token];
        if (available < amount) revert InsufficientAvailableBalance();
        availableBalance[msg.sender][token] = available - amount;
        totalAccounted[token] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawal(msg.sender, token, amount);
    }

    function lockCollateral(address account, address token, uint256 amount) external onlyEngine {
        if (amount == 0) revert InvalidAmount();
        uint256 available = availableBalance[account][token];
        if (available < amount) revert InsufficientAvailableBalance();
        availableBalance[account][token] = available - amount;
        lockedBalance[account][token] += amount;
        emit CollateralLocked(account, token, amount);
    }

    function unlockCollateral(address account, address token, uint256 amount) external onlyEngine {
        if (amount == 0) revert InvalidAmount();
        uint256 lockedAmount = lockedBalance[account][token];
        if (lockedAmount < amount) revert InsufficientLockedBalance();
        lockedBalance[account][token] = lockedAmount - amount;
        availableBalance[account][token] += amount;
        emit CollateralUnlocked(account, token, amount);
    }

    /// @notice Apply realized PnL after a position is reduced/closed.
    /// @dev Positive PnL requires unaccounted vault liquidity supplied by protocol LP/insurance mechanisms.
    function settlePnL(address account, address token, int256 pnl) external onlyEngine {
        if (pnl > 0) {
            uint256 profit = uint256(pnl);
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            if (tokenBalance < totalAccounted[token] + profit) revert InsufficientVaultLiquidity();
            availableBalance[account][token] += profit;
            totalAccounted[token] += profit;
        } else if (pnl < 0) {
            uint256 loss = uint256(-pnl);
            uint256 lockedAmount = lockedBalance[account][token];
            if (lockedAmount < loss) revert InsufficientLockedBalance();
            lockedBalance[account][token] = lockedAmount - loss;
            totalAccounted[token] -= loss;
        }
        emit PnLSettled(account, token, pnl);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }
}
