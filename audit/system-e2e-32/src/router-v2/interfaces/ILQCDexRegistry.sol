// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCDexRegistry {
    function dexCount() external view returns (uint256);
    function dexIdAt(uint256 index) external view returns (bytes32);
    function getDex(bytes32 dexId) external view returns (address adapter, bool enabled, uint32 priority);
}
