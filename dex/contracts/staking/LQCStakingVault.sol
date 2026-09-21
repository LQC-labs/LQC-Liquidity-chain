// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStakingRead} from "./interfaces/ILQCStakingRead.sol";
import {ILQCStakingRewardHook} from "./interfaces/ILQCStakingRewardHook.sol";

/// @notice Canonical custody/accounting vault for LQC staking principal.
/// @dev Repository candidate only: lock/cooldown/unstake (6/17), final emergency
///      controls (6/18), integration (6/19) and release review are still required.
///      Do not deploy or deposit user funds into this incomplete candidate.
contract LQCStakingVault is ILQCStakingRead {
    using SafeTransferLib for address;

    address public immutable override asset;
    address public owner;
    address public pendingOwner;
    address public rewardController;
    uint256 public override totalStaked;
    mapping(address => uint256) public override stakedBalance;
    uint256 private unlocked = 1;

    event Staked(address indexed caller, address indexed account, uint256 amount);
    event RewardControllerBound(address indexed controller);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error ZeroAmount();
    error UnsupportedTokenBehavior();
    error Reentrancy();
    error InvalidRewardController();

    modifier onlyOwner() { if (msg.sender != owner) revert Forbidden(); _; }
    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address asset_, address owner_) {
        if (asset_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (asset_.code.length == 0) revert UnsupportedTokenBehavior();
        asset = asset_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /// @notice One-time reward binding, before the first stake.
    /// @dev No owner can replace/remove the hook after reward liabilities arise.
    function setRewardController(address controller) external onlyOwner nonReentrant {
        if (rewardController != address(0) || totalStaked != 0 || controller.code.length == 0) {
            revert InvalidRewardController();
        }
        if (ILQCStakingRewardHook(controller).stakingVault() != address(this)) {
            revert InvalidRewardController();
        }
        rewardController = controller;
        emit RewardControllerBound(controller);
    }

    function stake(uint256 amount, address account) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (account == address(0) || account == address(this)) revert ZeroAddress();
        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        if (beforeBalance < totalStaked) revert UnsupportedTokenBehavior();

        // Settle rewards using the OLD total and OLD account balance. Future
        // 6/17 exit paths must apply this same rule before any balance decrease.
        if (rewardController != address(0)) {
            ILQCStakingRewardHook(rewardController).checkpoint(account);
        }
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(asset).balanceOf(address(this)) != beforeBalance + amount) {
            revert UnsupportedTokenBehavior();
        }
        stakedBalance[account] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, account, amount);
    }

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
}
