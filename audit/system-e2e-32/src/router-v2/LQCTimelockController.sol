// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCOwnableRegistry {
    function acceptOwnership() external;
}

/// @notice Minimal operation timelock intended to be owned by a governance multisig.
contract LQCTimelockController {
    uint256 public constant MIN_DELAY = 1 hours;
    address public proposer;
    address public pendingProposer;
    uint256 public immutable delay;
    mapping(bytes32 => uint256) public readyAt;

    event OperationScheduled(bytes32 indexed operationId, address indexed target, uint256 value, uint256 readyAt);
    event OperationCancelled(bytes32 indexed operationId);
    event OperationExecuted(bytes32 indexed operationId, address indexed target, uint256 value);
    event ProposerTransferStarted(address indexed proposer, address indexed pendingProposer);
    event ProposerTransferred(address indexed previousProposer, address indexed newProposer);

    error Forbidden();
    error ZeroAddress();
    error InvalidDelay();
    error AlreadyScheduled();
    error NotReady();
    error CallFailed();

    modifier onlyProposer() {
        if (msg.sender != proposer) revert Forbidden();
        _;
    }

    constructor(address proposer_, uint256 delay_) {
        if (proposer_ == address(0)) revert ZeroAddress();
        if (delay_ < MIN_DELAY) revert InvalidDelay();
        proposer = proposer_;
        delay = delay_;
        emit ProposerTransferred(address(0), proposer_);
    }

    receive() external payable {}

    function operationId(address target, uint256 value, bytes calldata data, bytes32 salt)
        public pure returns (bytes32)
    {
        return keccak256(abi.encode(target, value, data, salt));
    }

    function schedule(address target, uint256 value, bytes calldata data, bytes32 salt)
        external onlyProposer returns (bytes32 id)
    {
        if (target == address(0)) revert ZeroAddress();
        id = operationId(target, value, data, salt);
        if (readyAt[id] != 0) revert AlreadyScheduled();
        uint256 timestamp = block.timestamp + delay;
        readyAt[id] = timestamp;
        emit OperationScheduled(id, target, value, timestamp);
    }

    function cancel(bytes32 id) external onlyProposer {
        if (readyAt[id] == 0) revert NotReady();
        delete readyAt[id];
        emit OperationCancelled(id);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external payable returns (bytes memory result)
    {
        bytes32 id = operationId(target, value, data, salt);
        uint256 timestamp = readyAt[id];
        if (timestamp == 0 || block.timestamp < timestamp) revert NotReady();
        delete readyAt[id];
        (bool ok, bytes memory response) = target.call{value: value}(data);
        if (!ok) revert CallFailed();
        emit OperationExecuted(id, target, value);
        return response;
    }

    /// @dev Safe bootstrap helper: the registry itself must already name this contract pending owner.
    function acceptRegistryOwnership(address registry) external {
        if (registry == address(0)) revert ZeroAddress();
        ILQCOwnableRegistry(registry).acceptOwnership();
    }

    function beginProposerTransfer(address newProposer) external onlyProposer {
        if (newProposer == address(0)) revert ZeroAddress();
        pendingProposer = newProposer;
        emit ProposerTransferStarted(proposer, newProposer);
    }

    function acceptProposer() external {
        if (msg.sender != pendingProposer) revert Forbidden();
        address previous = proposer;
        proposer = msg.sender;
        pendingProposer = address(0);
        emit ProposerTransferred(previous, msg.sender);
    }
}
