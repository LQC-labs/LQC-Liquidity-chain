// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCPausableDexRegistry {
    function setDexEnabled(bytes32 dexId, bool enabled) external;
}

interface ILQCPausableRiskRegistry {
    function pauseSwaps() external;
}

/// @notice Separate emergency role that may only disable DEX routes, never re-enable or reconfigure them.
contract LQCEmergencyController {
    address public owner;
    address public pendingOwner;
    address public immutable registry;
    address public immutable riskRegistry;
    mapping(address => bool) public guardians;

    event GuardianChanged(address indexed guardian, bool enabled);
    event DexEmergencyPaused(bytes32 indexed dexId, address indexed guardian, uint256 timestamp);
    event AllSwapsEmergencyPaused(address indexed guardian, uint256 timestamp);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();

    constructor(address owner_, address registry_, address riskRegistry_) {
        if (owner_ == address(0) || registry_ == address(0) || riskRegistry_ == address(0)) revert ZeroAddress();
        owner = owner_;
        registry = registry_;
        riskRegistry = riskRegistry_;
        guardians[owner_] = true;
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianChanged(owner_, true);
    }

    function beginOwnershipTransfer(address newOwner) external {
        if (msg.sender != owner) revert Forbidden();
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

    function setGuardian(address guardian, bool enabled) external {
        if (msg.sender != owner) revert Forbidden();
        if (guardian == address(0)) revert ZeroAddress();
        guardians[guardian] = enabled;
        emit GuardianChanged(guardian, enabled);
    }

    function pauseDex(bytes32 dexId) external {
        if (!guardians[msg.sender]) revert Forbidden();
        ILQCPausableDexRegistry(registry).setDexEnabled(dexId, false);
        emit DexEmergencyPaused(dexId, msg.sender, block.timestamp);
    }

    function pauseAllSwaps() external {
        if (!guardians[msg.sender]) revert Forbidden();
        ILQCPausableRiskRegistry(riskRegistry).pauseSwaps();
        emit AllSwapsEmergencyPaused(msg.sender, block.timestamp);
    }
}
