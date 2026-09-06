// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal delayed executor intended to be administered by a multisig wallet.
contract LQCRouterTimelock {
    uint256 public constant MIN_DELAY = 1 hours;
    uint256 public constant MAX_DELAY = 30 days;

    address public admin;
    address public pendingAdmin;
    uint256 public immutable minDelay;
    mapping(bytes32 => uint256) public operationReadyAt;

    event OperationScheduled(bytes32 indexed id, address indexed target, uint256 value, uint256 readyAt);
    event OperationCancelled(bytes32 indexed id);
    event OperationExecuted(bytes32 indexed id, address indexed target, uint256 value);
    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    error Forbidden();
    error ZeroAddress();
    error InvalidDelay();
    error AlreadyScheduled();
    error OperationUnavailable();
    error OperationNotReady();
    error CallFailed(bytes reason);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Forbidden();
        _;
    }

    constructor(address admin_, uint256 minDelay_) {
        if (admin_ == address(0)) revert ZeroAddress();
        if (minDelay_ < MIN_DELAY || minDelay_ > MAX_DELAY) revert InvalidDelay();
        admin = admin_;
        minDelay = minDelay_;
        emit AdminTransferred(address(0), admin_);
    }

    receive() external payable {}

    function hashOperation(address target, uint256 value, bytes calldata data, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), target, value, data, salt));
    }

    function schedule(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        onlyAdmin
        returns (bytes32 id)
    {
        if (target == address(0)) revert ZeroAddress();
        id = hashOperation(target, value, data, salt);
        if (operationReadyAt[id] != 0) revert AlreadyScheduled();
        uint256 readyAt = block.timestamp + minDelay;
        operationReadyAt[id] = readyAt;
        emit OperationScheduled(id, target, value, readyAt);
    }

    function cancel(bytes32 id) external onlyAdmin {
        uint256 readyAt = operationReadyAt[id];
        if (readyAt == 0 || readyAt == 1) revert OperationUnavailable();
        delete operationReadyAt[id];
        emit OperationCancelled(id);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        onlyAdmin
        returns (bytes memory result)
    {
        bytes32 id = hashOperation(target, value, data, salt);
        uint256 readyAt = operationReadyAt[id];
        if (readyAt == 0 || readyAt == 1) revert OperationUnavailable();
        if (block.timestamp < readyAt) revert OperationNotReady();
        operationReadyAt[id] = 1;
        (bool success, bytes memory returnData) = target.call{value: value}(data);
        if (!success) revert CallFailed(returnData);
        emit OperationExecuted(id, target, value);
        return returnData;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert Forbidden();
        address previousAdmin = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(previousAdmin, msg.sender);
    }
}
