// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILQCSourceEscrow {
    function release(bytes32 intentHash,address recipient) external;
    function intentRecord(bytes32 intentHash) external view returns(address sender,uint256 nonce,uint256 deadline,uint8 status);
}

contract LQCIntentHub {
    address public owner;
    address public guardian;
    address public solver;
    ILQCSourceEscrow public immutable escrow;
    bool public paused;

    error Unauthorized(); error Paused(); error InvalidAddress(); error IntentNotPending(); error IntentExpired();
    event SolverUpdated(address indexed solver); event GuardianUpdated(address indexed guardian);
    event PausedState(bool paused); event IntentExecuted(bytes32 indexed intentHash,address indexed solver,address indexed recipient);

    constructor(address escrow_,address owner_,address guardian_){
        if(escrow_==address(0)||owner_==address(0)||guardian_==address(0))revert InvalidAddress();
        escrow=ILQCSourceEscrow(escrow_);owner=owner_;guardian=guardian_;
    }
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyGuardianOrOwner(){if(msg.sender!=guardian&&msg.sender!=owner)revert Unauthorized();_;}
    modifier onlySolver(){if(msg.sender!=solver)revert Unauthorized();_;}
    modifier whenActive(){if(paused)revert Paused();_;}

    function setSolver(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();solver=next;emit SolverUpdated(next);}
    function setGuardian(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();guardian=next;emit GuardianUpdated(next);}
    function setPaused(bool value) external onlyGuardianOrOwner {paused=value;emit PausedState(value);}

    function executeIntent(bytes32 intentHash,address recipient) external onlySolver whenActive {
        if(recipient==address(0))revert InvalidAddress();
        (, ,uint256 deadline,uint8 status)=escrow.intentRecord(intentHash);
        if(status!=1)revert IntentNotPending();
        if(block.timestamp>deadline)revert IntentExpired();
        escrow.release(intentHash,recipient);
        emit IntentExecuted(intentHash,msg.sender,recipient);
    }
}
