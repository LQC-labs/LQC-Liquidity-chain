// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStakingRead} from "./interfaces/ILQCStakingRead.sol";

/// @notice Variable, pre-funded LQC reward accounting for the canonical Staking Vault.
/// @dev Governance bounds are deployment-time inputs. Guardian may stop new funding,
///      while already-earned user claims remain available.
contract LQCStakingRewards {
    using SafeTransferLib for address;

    uint256 public constant RAY = 1e27;

    ILQCStakingRead public immutable stakingVault;
    address public immutable rewardToken;
    uint256 public immutable programBudgetCap;
    uint256 public immutable maxRewardRate;
    uint64 public immutable maxRewardDuration;

    address public owner;
    address public pendingOwner;
    address public guardian;

    bool public fundingPaused;
    uint256 public rewardRate;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public rewardReserve;
    uint256 public totalFunded;
    uint256 public totalClaimed;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private unlocked = 1;

    event RewardFunded(address indexed funder, uint256 amount, uint256 duration, uint256 rewardRate);
    event RewardClaimed(address indexed account, uint256 amount);
    event FundingPauseChanged(bool paused, address indexed caller);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidDuration();
    error RewardRateTooSmall();
    error UnsupportedTokenBehavior();
    error InsufficientRewardReserve();
    error Reentrancy();
    error FundingPaused();
    error ProgramBudgetExceeded();
    error RewardRateExceeded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert Forbidden();
        _;
    }

    modifier onlyVault() {
        if (msg.sender != address(stakingVault)) revert Forbidden();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        address stakingVault_,
        address owner_,
        address guardian_,
        uint256 programBudgetCap_,
        uint256 maxRewardRate_,
        uint64 maxRewardDuration_
    ) {
        if (
            stakingVault_ == address(0) || owner_ == address(0) || guardian_ == address(0)
                || stakingVault_.code.length == 0
        ) revert ZeroAddress();
        if (programBudgetCap_ == 0 || maxRewardRate_ == 0) revert ZeroAmount();
        if (maxRewardDuration_ == 0) revert InvalidDuration();

        stakingVault = ILQCStakingRead(stakingVault_);
        rewardToken = ILQCStakingRead(stakingVault_).asset();
        if (rewardToken == address(0)) revert ZeroAddress();

        owner = owner_;
        guardian = guardian_;
        programBudgetCap = programBudgetCap_;
        maxRewardRate = maxRewardRate_;
        maxRewardDuration = maxRewardDuration_;

        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
    }

    function checkpoint(address account) external onlyVault {
        if (account == address(0)) revert ZeroAddress();
        _updateReward(account);
    }

    /// @notice Adds an exact, pre-funded LQC reward budget inside approved deployment-time limits.
    function fundRewards(uint256 amount, uint256 duration) external onlyOwner nonReentrant {
        if (fundingPaused) revert FundingPaused();
        if (amount == 0) revert ZeroAmount();
        if (duration == 0 || duration > maxRewardDuration) revert InvalidDuration();
        if (totalFunded + amount > programBudgetCap) revert ProgramBudgetExceeded();

        _updateReward(address(0));

        uint256 beforeBalance = IERC20(rewardToken).balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(rewardToken).balanceOf(address(this)) != beforeBalance + amount) {
            revert UnsupportedTokenBehavior();
        }

        uint256 remaining = block.timestamp < periodFinish ? (periodFinish - block.timestamp) * rewardRate : 0;
        uint256 scheduled = amount + remaining;
        uint256 newRate = scheduled / duration;
        if (newRate == 0) revert RewardRateTooSmall();
        if (newRate > maxRewardRate) revert RewardRateExceeded();

        rewardRate = newRate;
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;
        rewardReserve += amount;
        totalFunded += amount;

        if (IERC20(rewardToken).balanceOf(address(this)) < rewardReserve) revert InsufficientRewardReserve();
        emit RewardFunded(msg.sender, amount, duration, newRate);
    }

    /// @notice Claims remain available even when new reward funding is paused.
    function claim() external nonReentrant returns (uint256 amount) {
        _updateReward(msg.sender);
        amount = rewards[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > rewardReserve) revert InsufficientRewardReserve();

        rewards[msg.sender] = 0;
        rewardReserve -= amount;
        totalClaimed += amount;

        uint256 moduleBefore = IERC20(rewardToken).balanceOf(address(this));
        uint256 receiverBefore = IERC20(rewardToken).balanceOf(msg.sender);
        rewardToken.safeTransfer(msg.sender, amount);
        if (
            moduleBefore - IERC20(rewardToken).balanceOf(address(this)) != amount
                || IERC20(rewardToken).balanceOf(msg.sender) - receiverBefore != amount
        ) revert UnsupportedTokenBehavior();

        emit RewardClaimed(msg.sender, amount);
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        uint256 total = stakingVault.totalStaked();
        if (total == 0) return rewardPerTokenStored;
        uint256 applicable = lastTimeRewardApplicable();
        if (applicable <= lastUpdateTime) return rewardPerTokenStored;
        return rewardPerTokenStored + (applicable - lastUpdateTime) * rewardRate * RAY / total;
    }

    function earned(address account) public view returns (uint256) {
        uint256 delta = rewardPerToken() - userRewardPerTokenPaid[account];
        return stakingVault.stakedBalance(account) * delta / RAY + rewards[account];
    }

    function isFullyBacked() external view returns (bool) {
        return IERC20(rewardToken).balanceOf(address(this)) >= rewardReserve;
    }

    /// @notice Owner/guardian may stop new schedules immediately.
    function pauseFunding() external onlyOwnerOrGuardian {
        if (!fundingPaused) {
            fundingPaused = true;
            emit FundingPauseChanged(true, msg.sender);
        }
    }

    /// @notice Only Governance/owner may resume funding after review.
    function resumeFunding() external onlyOwner {
        if (fundingPaused) {
            fundingPaused = false;
            emit FundingPauseChanged(false, msg.sender);
        }
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

    function _updateReward(address account) private {
        uint256 currentRewardPerToken = rewardPerToken();
        rewardPerTokenStored = currentRewardPerToken;
        lastUpdateTime = lastTimeRewardApplicable();

        if (account != address(0)) {
            uint256 delta = currentRewardPerToken - userRewardPerTokenPaid[account];
            rewards[account] += stakingVault.stakedBalance(account) * delta / RAY;
            userRewardPerTokenPaid[account] = currentRewardPerToken;
        }
    }
}
