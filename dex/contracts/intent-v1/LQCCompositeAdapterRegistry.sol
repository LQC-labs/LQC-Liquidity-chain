// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Governance allowlist for Gate-6 Composite Intent action adapters.
/// @dev Runtime code hashes are pinned so an address whose code changes is no longer eligible.
contract LQCCompositeAdapterRegistry {
    uint8 public constant MAX_ACTION_KIND = 2;

    struct AdapterConfig {
        uint8 kind;
        bool enabled;
        bytes32 runtimeCodeHash;
        uint64 registeredAt;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    address[] private adapters;
    mapping(address adapter => AdapterConfig) private configs;
    mapping(address adapter => uint256) private indexPlusOne;

    event AdapterRegistered(address indexed adapter, uint8 indexed kind, bytes32 runtimeCodeHash);
    event AdapterStatusChanged(address indexed adapter, bool enabled);
    event AdapterRemoved(address indexed adapter);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidAdapter();
    error InvalidActionKind();
    error AdapterExists();
    error AdapterNotFound();
    error AdapterMustBeDisabled();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address guardian_) {
        if (owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
    }

    function registerAdapter(address adapter, uint8 kind) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        if (kind > MAX_ACTION_KIND) revert InvalidActionKind();
        if (adapter.code.length == 0) revert InvalidAdapter();
        if (indexPlusOne[adapter] != 0) revert AdapterExists();
        bytes32 runtimeCodeHash = adapter.codehash;
        configs[adapter] = AdapterConfig(kind, true, runtimeCodeHash, uint64(block.timestamp));
        adapters.push(adapter);
        indexPlusOne[adapter] = adapters.length;
        emit AdapterRegistered(adapter, kind, runtimeCodeHash);
    }

    function setAdapterEnabled(address adapter, bool enabled) external {
        if (enabled) {
            if (msg.sender != owner) revert Unauthorized();
        } else if (msg.sender != owner && msg.sender != guardian) {
            revert Unauthorized();
        }
        AdapterConfig storage config = configs[adapter];
        if (indexPlusOne[adapter] == 0) revert AdapterNotFound();
        if (enabled && (adapter.code.length == 0 || adapter.codehash != config.runtimeCodeHash)) revert InvalidAdapter();
        config.enabled = enabled;
        emit AdapterStatusChanged(adapter, enabled);
    }

    function isAdapterAllowed(address adapter, uint8 kind) external view returns (bool) {
        AdapterConfig storage config = configs[adapter];
        return indexPlusOne[adapter] != 0 && config.enabled && config.kind == kind && adapter.code.length != 0
            && adapter.codehash == config.runtimeCodeHash;
    }

    function getAdapter(address adapter) external view returns (AdapterConfig memory) {
        if (indexPlusOne[adapter] == 0) revert AdapterNotFound();
        return configs[adapter];
    }

    function adapterCount() external view returns (uint256) {
        return adapters.length;
    }

    function adapterAt(uint256 index) external view returns (address) {
        return adapters[index];
    }

    function removeAdapter(address adapter) external onlyOwner {
        uint256 position = indexPlusOne[adapter];
        if (position == 0) revert AdapterNotFound();
        if (configs[adapter].enabled) revert AdapterMustBeDisabled();
        uint256 index = position - 1;
        uint256 lastIndex = adapters.length - 1;
        if (index != lastIndex) {
            address lastAdapter = adapters[lastIndex];
            adapters[index] = lastAdapter;
            indexPlusOne[lastAdapter] = position;
        }
        adapters.pop();
        delete indexPlusOne[adapter];
        delete configs[adapter];
        emit AdapterRemoved(adapter);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
}
