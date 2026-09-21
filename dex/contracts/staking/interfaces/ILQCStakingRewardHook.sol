// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Reward-only hook. It grants no authority over staking principal.
interface ILQCStakingRewardHook {
    function stakingVault() external view returns (address);
    /// @dev Called by the vault BEFORE every account balance change.
    function checkpoint(address account) external;
}
