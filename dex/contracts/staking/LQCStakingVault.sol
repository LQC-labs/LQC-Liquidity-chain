// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStakingRead} from "./interfaces/ILQCStakingRead.sol";

interface ILQCStakingRewardCheckpoint {
    function stakingVault() external view returns (address);
    function rewardToken() external view returns (address);
    function checkpoint(address account) external;
}

/// @notice Canonical custody/accounting vault for LQC staking principal.
/// @dev Rewards are accounted in a separate Master 6/16 module. The vault only
///      checkpoints the configured reward module before a principal balance change.
///      Repository-only candidate: no deployment/user deposits until the 6/17
///      exit path, 6/18 controls and subsequent release gates are complete.
contract LQCStakingVault is ILQCStakingRead {
    using SafeTransferLib for address;

    address public immutable override asset;
    address public owner;
    address public pendingOwner;
    address public rewardAccounting;

    uint256 public override totalStaked;
    mapping(address => uint256) public override stakedBalance;

    uint256 private unlocked = 1;

    event Staked(address indexed caller, address indexed account, uint256 amount);
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

    constructor(address asset_, address owner_) {
        if (asset_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        asset = asset_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /// @notice One-time binding before the first stake, to a module for THIS vault.
    /// @dev Prevents reward history being introduced after uncheckpointed balances.
    ///      Replacement/migration policy belongs to Master 6/18 governance controls.
    function initializeRewardAccounting(address module) external onlyOwner nonReentrant {
        if (module == address(0) || module.code.length == 0) revert InvalidModule();
        if (rewardAccounting != address(0)) revert AlreadyConfigured();
        if (totalStaked != 0) revert InvalidModule();
        ILQCStakingRewardCheckpoint candidate = ILQCStakingRewardCheckpoint(module);
        if (candidate.stakingVault() != address(this) || candidate.rewardToken() != asset) {
            revert InvalidModule();
        }
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

    /// @notice Confirms that actual token custody covers all accounted staking principal.
    /// @dev Unsolicited token donations may create surplus but never increase staked balances.
    function isFullyBacked() external view override returns (bool) {
        return IERC20(asset).balanceOf(address(this)) >= totalStaked;
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
