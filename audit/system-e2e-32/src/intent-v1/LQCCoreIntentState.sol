// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Shared canonical intent lifecycle primitive for LQC Intent/Solver components.
/// @dev 5/1 foundation reused by SourceEscrow and IntentHub. No token custody is implemented here.
abstract contract LQCCoreIntentState {
    enum IntentStatus { None, Pending, Executed, Cancelled, Expired }

    struct IntentRecord {
        address sender;
        uint256 nonce;
        uint256 deadline;
        IntentStatus status;
    }

    mapping(bytes32 => IntentRecord) internal _intents;
    mapping(address => mapping(uint256 => bytes32)) internal _nonceIntent;

    error InvalidIntentHash();
    error InvalidSender();
    error InvalidDeadline();
    error IntentAlreadyRegistered();
    error NonceAlreadyUsed();
    error IntentNotPending();
    error IntentExpired();
    error IntentNotExpired();
    error UnauthorizedIntentSender();

    event IntentRegistered(bytes32 indexed intentHash,address indexed sender,uint256 indexed nonce,uint256 deadline);
    event IntentStatusChanged(bytes32 indexed intentHash,IntentStatus status);

    function intentRecord(bytes32 intentHash) external view returns(IntentRecord memory){return _intents[intentHash];}
    function intentForNonce(address sender,uint256 nonce) external view returns(bytes32){return _nonceIntent[sender][nonce];}

    function _registerIntent(bytes32 intentHash,address sender,uint256 nonce,uint256 deadline) internal {
        if(intentHash==bytes32(0)) revert InvalidIntentHash();
        if(sender==address(0)) revert InvalidSender();
        if(deadline<=block.timestamp) revert InvalidDeadline();
        if(_intents[intentHash].status!=IntentStatus.None) revert IntentAlreadyRegistered();
        if(_nonceIntent[sender][nonce]!=bytes32(0)) revert NonceAlreadyUsed();
        _intents[intentHash]=IntentRecord(sender,nonce,deadline,IntentStatus.Pending);
        _nonceIntent[sender][nonce]=intentHash;
        emit IntentRegistered(intentHash,sender,nonce,deadline);
    }

    function _requirePending(bytes32 intentHash) internal view returns(IntentRecord memory record){
        record=_intents[intentHash];
        if(record.status!=IntentStatus.Pending) revert IntentNotPending();
        if(block.timestamp>record.deadline) revert IntentExpired();
    }

    function _markExecuted(bytes32 intentHash) internal {
        _requirePending(intentHash);
        _intents[intentHash].status=IntentStatus.Executed;
        emit IntentStatusChanged(intentHash,IntentStatus.Executed);
    }

    function _cancelIntent(bytes32 intentHash,address caller) internal {
        IntentRecord memory record=_requirePending(intentHash);
        if(caller!=record.sender) revert UnauthorizedIntentSender();
        _intents[intentHash].status=IntentStatus.Cancelled;
        emit IntentStatusChanged(intentHash,IntentStatus.Cancelled);
    }

    function _markExpired(bytes32 intentHash) internal {
        IntentRecord storage record=_intents[intentHash];
        if(record.status!=IntentStatus.Pending) revert IntentNotPending();
        if(block.timestamp<=record.deadline) revert IntentNotExpired();
        record.status=IntentStatus.Expired;
        emit IntentStatusChanged(intentHash,IntentStatus.Expired);
    }
}
