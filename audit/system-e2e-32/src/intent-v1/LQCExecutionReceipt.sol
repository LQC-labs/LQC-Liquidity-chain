// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stores execution reports supplied by the configured recorder.
/// @dev Exact-field verification proves a stored report exists, not that a swap occurred.
/// Production integration must bind the recorder to the atomic execution path and
/// derive amountOut from actual token balances; that integration is a separate gate.
contract LQCExecutionReceipt {
    struct Receipt {
        bytes32 executionHash;
        address solver;
        bytes32 routeId;
        uint256 amountOut;
        uint256 recordedAt;
    }

    mapping(bytes32=>Receipt) public receipts;
    address public owner;
    address public recorder;

    error Unauthorized(); error InvalidAddress(); error InvalidReceipt(); error ReceiptAlreadyExists();
    event RecorderUpdated(address indexed recorder);
    event ReceiptRecorded(bytes32 indexed intentHash,bytes32 indexed executionHash,address indexed solver,bytes32 routeId,uint256 amountOut,uint256 recordedAt);

    constructor(address owner_){if(owner_==address(0))revert InvalidAddress();owner=owner_;}
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyRecorder(){if(msg.sender!=recorder)revert Unauthorized();_;}

    function setRecorder(address next) external onlyOwner {
        if(next==address(0))revert InvalidAddress();recorder=next;emit RecorderUpdated(next);
    }

    function record(bytes32 intentHash,bytes32 executionHash,address solver,bytes32 routeId,uint256 amountOut) external onlyRecorder returns(bytes32 receiptHash){
        if(intentHash==bytes32(0)||executionHash==bytes32(0)||solver==address(0)||routeId==bytes32(0)||amountOut==0)revert InvalidReceipt();
        if(receipts[intentHash].executionHash!=bytes32(0))revert ReceiptAlreadyExists();
        uint256 recordedAt=block.timestamp;
        receipts[intentHash]=Receipt(executionHash,solver,routeId,amountOut,recordedAt);
        receiptHash=keccak256(abi.encode(block.chainid,address(this),intentHash,executionHash,solver,routeId,amountOut,recordedAt));
        emit ReceiptRecorded(intentHash,executionHash,solver,routeId,amountOut,recordedAt);
    }

    /// @notice Returns the canonical hash of a recorded receipt; absent receipts revert.
    function getReceiptHash(bytes32 intentHash) external view returns(bytes32){
        Receipt memory r=receipts[intentHash];
        if(intentHash==bytes32(0)||r.executionHash==bytes32(0))revert InvalidReceipt();
        return keccak256(abi.encode(block.chainid,address(this),intentHash,r.executionHash,r.solver,r.routeId,r.amountOut,r.recordedAt));
    }

    function verify(bytes32 intentHash,bytes32 executionHash,address solver,bytes32 routeId,uint256 amountOut,uint256 recordedAt) external view returns(bool){
        Receipt memory r=receipts[intentHash];
        // Unwritten mapping entries are all zero: equality alone must never imply existence.
        if(intentHash==bytes32(0)||r.executionHash==bytes32(0))return false;
        return r.executionHash==executionHash&&r.solver==solver&&r.routeId==routeId&&r.amountOut==amountOut&&r.recordedAt==recordedAt;
    }
}
