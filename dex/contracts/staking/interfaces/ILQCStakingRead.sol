// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Versioned read boundary for the canonical LQC Staking Vault.
/// @dev Future consumers such as Launchpad may read eligibility inputs through this interface
///      without custody access or reward-accounting mutation rights.
interface ILQCStakingRead {
    function asset() external view returns (address);
    function totalStaked() external view returns (uint256);
    function totalPendingUnstake() external view returns (uint256);
    function stakedBalance(address account) external view returns (uint256);
    function lockUntil(address account) external view returns (uint64);
    function pendingUnstakeOf(address account) external view returns (uint256 amount, uint64 availableAt);
    function isFullyBacked() external view returns (bool);
}
