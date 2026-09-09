// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCDexRegistry} from "./interfaces/ILQCDexRegistry.sol";
import {ILQCExecutionAdapter} from "./interfaces/ILQCExecutionAdapter.sol";

/// @notice Owner-controlled registry of reviewed DEX adapters.
contract LQCDexRegistry is ILQCDexRegistry {
    struct Dex {
        address adapter;
        bool enabled;
        uint32 priority;
        uint64 addedAt;
        string name;
    }

    address public owner;
    address public pendingOwner;
    address public pauseAdmin;
    bytes32[] private dexIds;
    mapping(bytes32 => Dex) private dexes;
    mapping(bytes32 => uint256) private indexPlusOne;

    event DexAdded(bytes32 indexed dexId, address indexed adapter, string name, uint32 priority);
    event DexUpdated(bytes32 indexed dexId, address indexed adapter, uint32 priority);
    event DexStatusChanged(bytes32 indexed dexId, bool enabled);
    event DexRemoved(bytes32 indexed dexId);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PauseAdminChanged(address indexed previousAdmin, address indexed newAdmin);

    error Forbidden();
    error ZeroAddress();
    error InvalidDexId();
    error DexExists();
    error DexNotFound();
    error InvalidAdapter();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        pauseAdmin = owner_;
        emit OwnershipTransferred(address(0), owner_);
        emit PauseAdminChanged(address(0), owner_);
    }

    function addDex(bytes32 dexId, address adapter, string calldata name, uint32 priority) external onlyOwner {
        if (dexId == bytes32(0)) revert InvalidDexId();
        _validateAdapter(adapter);
        if (indexPlusOne[dexId] != 0) revert DexExists();
        dexes[dexId] = Dex(adapter, true, priority, uint64(block.timestamp), name);
        dexIds.push(dexId);
        indexPlusOne[dexId] = dexIds.length;
        emit DexAdded(dexId, adapter, name, priority);
    }

    function updateDex(bytes32 dexId, address adapter, uint32 priority) external onlyOwner {
        if (indexPlusOne[dexId] == 0) revert DexNotFound();
        _validateAdapter(adapter);
        Dex storage dex = dexes[dexId];
        dex.adapter = adapter;
        dex.priority = priority;
        emit DexUpdated(dexId, adapter, priority);
    }

    function setDexEnabled(bytes32 dexId, bool enabled) external {
        if (enabled) {
            if (msg.sender != owner) revert Forbidden();
        } else if (msg.sender != owner && msg.sender != pauseAdmin) {
            revert Forbidden();
        }
        if (indexPlusOne[dexId] == 0) revert DexNotFound();
        dexes[dexId].enabled = enabled;
        emit DexStatusChanged(dexId, enabled);
    }

    function setPauseAdmin(address newPauseAdmin) external onlyOwner {
        if (newPauseAdmin == address(0)) revert ZeroAddress();
        address previousAdmin = pauseAdmin;
        pauseAdmin = newPauseAdmin;
        emit PauseAdminChanged(previousAdmin, newPauseAdmin);
    }

    function removeDex(bytes32 dexId) external onlyOwner {
        uint256 position = indexPlusOne[dexId];
        if (position == 0) revert DexNotFound();
        uint256 index = position - 1;
        uint256 lastIndex = dexIds.length - 1;
        if (index != lastIndex) {
            bytes32 lastId = dexIds[lastIndex];
            dexIds[index] = lastId;
            indexPlusOne[lastId] = position;
        }
        dexIds.pop();
        delete indexPlusOne[dexId];
        delete dexes[dexId];
        emit DexRemoved(dexId);
    }

    function _validateAdapter(address adapter) private view {
        if (adapter == address(0)) revert ZeroAddress();
        if (adapter.code.length == 0) revert InvalidAdapter();
        try ILQCExecutionAdapter(adapter).supportsExecution() returns (bool) {
            // Both quote-only (false) and execution-capable (true) reviewed adapters are valid.
        } catch {
            revert InvalidAdapter();
        }
    }

    function dexCount() external view override returns (uint256) {
        return dexIds.length;
    }

    function dexIdAt(uint256 index) external view override returns (bytes32) {
        return dexIds[index];
    }

    function getDex(bytes32 dexId) external view override returns (address adapter, bool enabled, uint32 priority) {
        if (indexPlusOne[dexId] == 0) revert DexNotFound();
        Dex storage dex = dexes[dexId];
        return (dex.adapter, dex.enabled, dex.priority);
    }

    function getDexDetails(bytes32 dexId) external view returns (Dex memory) {
        if (indexPlusOne[dexId] == 0) revert DexNotFound();
        return dexes[dexId];
    }

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
}
