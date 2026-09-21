// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStakingRead} from "./interfaces/ILQCStakingRead.sol";

/// @notice Canonical custody/accounting vault for LQC staking principal.
/// @dev Master 6/15 intentionally implements principal custody only.
///      Reward accounting is Master 6/16; lock/cooldown/unstake is Master 6/17;
///      governance/emergency controls are Master 6/18. This contract must not be
///      activated with user funds before the exit path and later safety gates exist.
contract LQCStakingVault is ILQCStakingRead {
    using SafeTransferLib for address;

    address public immutable override asset;
    address public owner;
    address public pendingOwner;

    uint256 public override totalStaked;
    mapping(address => uint256) public override stakedBalance;

    uint256 private unlocked = 1;

    event Staked(address indexed caller, address indexed account, uint256 amount);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error ZeroAmount();
    error UnsupportedTokenBehavior();
    error Reentrancy();

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

    /// @notice Stakes LQC principal for an account using exact-transfer accounting.
    /// @dev Fee-on-transfer/rebasing-style inbound behavior is rejected because staking
    ///      principal must remain deterministic and independently auditable.
    function stake(uint256 amount, address account) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (account == address(0)) revert ZeroAddress();

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
}
