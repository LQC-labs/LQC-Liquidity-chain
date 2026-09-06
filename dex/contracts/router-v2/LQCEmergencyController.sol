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
    address public immutable registry;
    address public immutable riskRegistry;
    mapping(address => bool) public guardians;

    event GuardianChanged(address indexed guardian, bool enabled);
    event DexEmergencyPaused(bytes32 indexed dexId, address indexed guardian, uint256 timestamp);
    event AllSwapsEmergencyPaused(address indexed guardian, uint256 timestamp);

    error Forbidden();
    error ZeroAddress();

    constructor(address owner_, address registry_, address riskRegistry_) {
        if (owner_ == address(0) || registry_ == address(0) || riskRegistry_ == address(0)) revert ZeroAddress();
        owner = owner_;
        registry = registry_;
        riskRegistry = riskRegistry_;
        guardians[owner_] = true;
        emit GuardianChanged(owner_, true);
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
