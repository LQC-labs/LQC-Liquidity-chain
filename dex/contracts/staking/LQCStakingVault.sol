// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStakingRead} from "./interfaces/ILQCStakingRead.sol";

interface ILQCStakingRewardCheckpoint {
    function checkpoint(address account) external;
}

/// @notice Canonical custody/accounting vault for LQC staking principal.
/// @dev Master 6/18 adds bounded governance and emergency controls without granting
///      Governance any right to seize user staking principal.
contract LQCStakingVault is ILQCStakingRead {
    using SafeTransferLib for address;

    struct PendingUnstake {
        uint128 amount;
        uint64 availableAt;
    }

    address public immutable override asset;
    uint64 public immutable maxCooldownDuration;

    address public owner;
    address public pendingOwner;
    address public guardian;
    address public rewardAccounting;

    uint64 public cooldownDuration;
    bool public stakingPaused;
    bool public emergencyExitEnabled;

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
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event StakingPauseChanged(bool paused, address indexed caller);
    event EmergencyExitChanged(bool enabled, address indexed caller);
    event CooldownDurationChanged(uint64 previousDuration, uint64 newDuration);
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
    error StakingPaused();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert Forbidden();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        address asset_,
        address owner_,
        address guardian_,
        uint64 cooldownDuration_,
        uint64 maxCooldownDuration_
    ) {
        if (asset_ == address(0) || owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        if (
            cooldownDuration_ == 0 || maxCooldownDuration_ == 0
                || cooldownDuration_ > maxCooldownDuration_
        ) revert InvalidCooldown();

        asset = asset_;
        owner = owner_;
        guardian = guardian_;
        cooldownDuration = cooldownDuration_;
        maxCooldownDuration = maxCooldownDuration_;

        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
    }

    /// @notice One-time binding to the canonical reward-accounting module.
    /// @dev Later migration requires an explicit reviewed replacement mechanism rather than an arbitrary hot-swap.
    function initializeRewardAccounting(address module) external onlyOwner {
        if (module == address(0) || module.code.length == 0) revert InvalidModule();
        if (rewardAccounting != address(0)) revert AlreadyConfigured();
        rewardAccounting = module;
        emit RewardAccountingInitialized(module);
    }

    /// @notice Stakes LQC principal for an account using exact-transfer accounting.
    function stake(uint256 amount, address account) external nonReentrant {
        if (stakingPaused) revert StakingPaused();
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
    /// @dev New lock extensions stop during a staking pause; existing users retain their exit rights.
    function extendLock(uint64 newLockUntil) external {
        if (stakingPaused) revert StakingPaused();
        if (stakedBalance[msg.sender] == 0) revert InsufficientStake();
        uint64 previous = lockUntil[msg.sender];
        if (newLockUntil <= block.timestamp || newLockUntil <= previous) revert InvalidLock();
        lockUntil[msg.sender] = newLockUntil;
        emit LockExtended(msg.sender, previous, newLockUntil);
    }

    /// @notice Removes principal from active staking/reward weight and starts the cooldown.
    /// @dev Emergency mode may waive lock and cooldown, but never transfers principal to Governance.
    function requestUnstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!emergencyExitEnabled && block.timestamp < lockUntil[msg.sender]) revert LockedStake();
        if (pendingUnstakes[msg.sender].amount != 0) revert PendingExitExists();

        uint256 active = stakedBalance[msg.sender];
        if (amount > active) revert InsufficientStake();
        if (amount > type(uint128).max) revert AmountOverflow();

        _checkpoint(msg.sender);

        stakedBalance[msg.sender] = active - amount;
        totalStaked -= amount;

        uint64 availableAt =
            emergencyExitEnabled ? uint64(block.timestamp) : uint64(block.timestamp + cooldownDuration);

        pendingUnstakes[msg.sender] = PendingUnstake(uint128(amount), availableAt);
        totalPendingUnstake += amount;

        emit UnstakeRequested(msg.sender, amount, availableAt);
    }

    /// @notice Cancels a pending exit and returns principal to active reward weight.
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

    function isFullyBacked() external view override returns (bool) {
        return IERC20(asset).balanceOf(address(this)) >= totalStaked + totalPendingUnstake;
    }

    /// @notice Owner/guardian may stop new staking and lock extensions; user exits remain live.
    function pauseNewStaking() external onlyOwnerOrGuardian {
        if (!stakingPaused) {
            stakingPaused = true;
            emit StakingPauseChanged(true, msg.sender);
        }
    }

    /// @notice Only Governance/owner may resume new staking after review.
    function resumeNewStaking() external onlyOwner {
        if (stakingPaused) {
            stakingPaused = false;
            emit StakingPauseChanged(false, msg.sender);
        }
    }

    /// @notice Owner/guardian may enable immediate user-controlled emergency exits.
    /// @dev Enabling emergency exits also pauses new staking.
    function enableEmergencyExit() external onlyOwnerOrGuardian {
        if (!stakingPaused) {
            stakingPaused = true;
            emit StakingPauseChanged(true, msg.sender);
        }
        if (!emergencyExitEnabled) {
            emergencyExitEnabled = true;
            emit EmergencyExitChanged(true, msg.sender);
        }
    }

    /// @notice Only Governance/owner may disable emergency mode after incident review.
    function disableEmergencyExit() external onlyOwner {
        if (emergencyExitEnabled) {
            emergencyExitEnabled = false;
            emit EmergencyExitChanged(false, msg.sender);
        }
    }

    /// @notice Governance may update the cooldown only inside the deployment-time safety ceiling.
    /// @dev Existing pending exits keep their previously snapshotted availableAt timestamp.
    function setCooldownDuration(uint64 newDuration) external onlyOwner {
        if (newDuration == 0 || newDuration > maxCooldownDuration) revert InvalidCooldown();
        uint64 previous = cooldownDuration;
        cooldownDuration = newDuration;
        emit CooldownDurationChanged(previous, newDuration);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        address previous = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(previous, newGuardian);
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
