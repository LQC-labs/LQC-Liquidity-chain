// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStakingRead} from "./interfaces/ILQCStakingRead.sol";

interface ILQCStakingRewardCheckpoint {
    function checkpoint(address account) external;
}

/// @notice Canonical custody/accounting vault for LQC staking principal.
/// @dev Rewards are accounted in a separate Master 6/16 module.
///      Master 6/17 adds user-controlled lock extension plus a two-step cooldown exit.
///      Governance/emergency mutation controls remain Master 6/18.
contract LQCStakingVault is ILQCStakingRead {
    using SafeTransferLib for address;

    struct PendingUnstake {
        uint128 amount;
        uint64 availableAt;
    }

    address public immutable override asset;
    address public owner;
    address public pendingOwner;
    address public rewardAccounting;

    uint64 public cooldownDuration;
    uint256 public override totalStaked;
    uint256 public override totalPendingUnstake;
    mapping(address => uint256) public override stakedBalance;
    mapping(address => uint64) public override lockUntil;
    mapping(address => PendingUnstake) private pendingUnstakes;

    uint256 private unlocked = 1;

    event Staked(address indexed caller, address indexed account, uint256 amount);
    event LockExtended(address indexed account, uint64 previousLockUntil, uint64 newLockUntil);
    event UnstakeRequested(address indexed account, uint256 amount, uint64 availableAt);
    event UnstakeCancelled(address indexed account, uint256 amount);
    event Unstaked(address indexed account, address indexed receiver, uint256 amount);
    event RewardAccountingInitialized(address indexed module);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error ZeroAmount();
    error UnsupportedTokenBehavior();
    error Reentrancy();
    error AlreadyConfigured();
    error InvalidModule();
    error InvalidCooldown();
    error InvalidLock();
    error LockedStake();
    error PendingExitExists();
    error NoPendingExit();
    error CooldownActive();
    error InsufficientStake();
    error AmountOverflow();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address asset_, address owner_, uint64 cooldownDuration_) {
        if (asset_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (cooldownDuration_ == 0) revert InvalidCooldown();
        asset = asset_;
        owner = owner_;
        cooldownDuration = cooldownDuration_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /// @notice One-time binding to the canonical reward-accounting module.
    /// @dev Replacement/migration policy belongs to Master 6/18 governance controls.
    function initializeRewardAccounting(address module) external onlyOwner {
        if (module == address(0) || module.code.length == 0) revert InvalidModule();
        if (rewardAccounting != address(0)) revert AlreadyConfigured();
        rewardAccounting = module;
        emit RewardAccountingInitialized(module);
    }

    /// @notice Stakes LQC principal for an account using exact-transfer accounting.
    function stake(uint256 amount, address account) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (account == address(0)) revert ZeroAddress();

        _checkpoint(account);

        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(asset).balanceOf(address(this)) != beforeBalance + amount) {
            revert UnsupportedTokenBehavior();
        }

        stakedBalance[account] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, account, amount);
    }

    /// @notice Voluntarily extends the caller's staking lock.
    /// @dev Lock can only move forward. Product presets such as 90/180 days live in UI/config,
    ///      not as hard-coded economic promises in the Core vault.
    function extendLock(uint64 newLockUntil) external {
        if (stakedBalance[msg.sender] == 0) revert InsufficientStake();
        uint64 previous = lockUntil[msg.sender];
        if (newLockUntil <= block.timestamp || newLockUntil <= previous) revert InvalidLock();
        lockUntil[msg.sender] = newLockUntil;
        emit LockExtended(msg.sender, previous, newLockUntil);
    }

    /// @notice Removes principal from active staking/reward weight and starts the cooldown.
    function requestUnstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp < lockUntil[msg.sender]) revert LockedStake();
        if (pendingUnstakes[msg.sender].amount != 0) revert PendingExitExists();

        uint256 active = stakedBalance[msg.sender];
        if (amount > active) revert InsufficientStake();
        if (amount > type(uint128).max) revert AmountOverflow();

        _checkpoint(msg.sender);

        stakedBalance[msg.sender] = active - amount;
        totalStaked -= amount;

        uint64 availableAt = uint64(block.timestamp + cooldownDuration);
        pendingUnstakes[msg.sender] = PendingUnstake(uint128(amount), availableAt);
        totalPendingUnstake += amount;

        emit UnstakeRequested(msg.sender, amount, availableAt);
    }

    /// @notice Cancels a pending exit and returns principal to active reward weight.
    /// @dev A checkpoint occurs before restoring active stake so cooldown time earns no retroactive rewards.
    function cancelUnstake() external nonReentrant {
        PendingUnstake memory pending = pendingUnstakes[msg.sender];
        if (pending.amount == 0) revert NoPendingExit();

        _checkpoint(msg.sender);

        delete pendingUnstakes[msg.sender];
        totalPendingUnstake -= pending.amount;
        stakedBalance[msg.sender] += pending.amount;
        totalStaked += pending.amount;

        emit UnstakeCancelled(msg.sender, pending.amount);
    }

    /// @notice Transfers principal only after the cooldown has completed.
    function completeUnstake(address receiver) external nonReentrant returns (uint256 amount) {
        if (receiver == address(0)) revert ZeroAddress();

        PendingUnstake memory pending = pendingUnstakes[msg.sender];
        if (pending.amount == 0) revert NoPendingExit();
        if (block.timestamp < pending.availableAt) revert CooldownActive();

        amount = pending.amount;
        delete pendingUnstakes[msg.sender];
        totalPendingUnstake -= amount;

        uint256 vaultBefore = IERC20(asset).balanceOf(address(this));
        uint256 receiverBefore = IERC20(asset).balanceOf(receiver);
        asset.safeTransfer(receiver, amount);
        if (
            vaultBefore - IERC20(asset).balanceOf(address(this)) != amount
                || IERC20(asset).balanceOf(receiver) - receiverBefore != amount
        ) revert UnsupportedTokenBehavior();

        emit Unstaked(msg.sender, receiver, amount);
    }

    function pendingUnstakeOf(address account) external view override returns (uint256 amount, uint64 availableAt) {
        PendingUnstake memory pending = pendingUnstakes[account];
        return (pending.amount, pending.availableAt);
    }

    /// @notice Confirms that actual token custody covers active and cooldown principal.
    /// @dev Unsolicited token donations may create surplus but never increase staking credit.
    function isFullyBacked() external view override returns (bool) {
        return IERC20(asset).balanceOf(address(this)) >= totalStaked + totalPendingUnstake;
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

    function _checkpoint(address account) private {
        address module = rewardAccounting;
        if (module != address(0)) ILQCStakingRewardCheckpoint(module).checkpoint(account);
    }
}
