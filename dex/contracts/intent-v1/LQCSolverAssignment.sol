// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LQCSolverAssignment {
    struct Assignment { address solver; bytes32 quoteHash; uint256 score; uint256 expiresAt; bool consumed; }
    mapping(bytes32=>Assignment) public assignments;
    address public owner;
    address public assigner;
    address public intentHub;

    error Unauthorized(); error InvalidAddress(); error InvalidAssignment(); error AlreadyAssigned(); error AssignmentExpired(); error AssignmentAlreadyConsumed(); error WrongSolver();
    event AssignerUpdated(address indexed assigner); event IntentHubUpdated(address indexed intentHub);
    event SolverAssigned(bytes32 indexed intentHash,address indexed solver,bytes32 indexed quoteHash,uint256 score,uint256 expiresAt);
    event AssignmentConsumed(bytes32 indexed intentHash,address indexed solver);

    constructor(address owner_){if(owner_==address(0))revert InvalidAddress();owner=owner_;}
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyAssigner(){if(msg.sender!=assigner)revert Unauthorized();_;}
    modifier onlyIntentHub(){if(msg.sender!=intentHub)revert Unauthorized();_;}

    function setAssigner(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();assigner=next;emit AssignerUpdated(next);}
    function setIntentHub(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();intentHub=next;emit IntentHubUpdated(next);}

    function assign(bytes32 intentHash,address solver,bytes32 quoteHash,uint256 score,uint256 expiresAt) external onlyAssigner {
        if(intentHash==bytes32(0)||solver==address(0)||quoteHash==bytes32(0)||score==0||expiresAt<=block.timestamp)revert InvalidAssignment();
        if(assignments[intentHash].solver!=address(0))revert AlreadyAssigned();
        assignments[intentHash]=Assignment(solver,quoteHash,score,expiresAt,false);
        emit SolverAssigned(intentHash,solver,quoteHash,score,expiresAt);
    }

    function consume(bytes32 intentHash,address solver,bytes32 quoteHash) external onlyIntentHub {
        Assignment storage a=assignments[intentHash];
        if(a.solver==address(0))revert InvalidAssignment();
        if(a.consumed)revert AssignmentAlreadyConsumed();
        if(block.timestamp>a.expiresAt)revert AssignmentExpired();
        if(a.solver!=solver)revert WrongSolver();
        if(a.quoteHash!=quoteHash)revert InvalidAssignment();
        a.consumed=true;emit AssignmentConsumed(intentHash,solver);
    }
}
