// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface ILQCInternalSolverIntent {
    struct RouteIntent {bytes32 intentHash;bytes32 dexId;address tokenIn;address tokenOut;uint256 amountIn;uint256 amountOutMinimum;address recipient;uint256 deadline;bytes routeData;}
    function execute(RouteIntent calldata r) external returns(uint256 amountOut);
}
interface ILQCSourceEscrowIntent {
    function intentRecord(bytes32 intentHash) external view returns(address sender,uint256 nonce,uint256 deadline,uint8 status);
    function escrows(bytes32 intentHash) external view returns(address token,uint256 amount);
}
interface ILQCExecutionReceiptIntent {
    function record(bytes32 intentHash,bytes32 executionHash,address solver,bytes32 routeId,uint256 amountOut) external returns(bytes32 receiptHash);
}

contract LQCIntentSolverBinding {
    using SafeTransferLib for address;

    ILQCInternalSolverIntent public immutable solver;
    ILQCSourceEscrowIntent public immutable escrow;
    ILQCExecutionReceiptIntent public immutable receipt;
    address public immutable intentHub;

    error UnauthorizedEscrow(); error InvalidAddress(); error InvalidIntent(); error IntentMismatch(); error IntentNotPending(); error IntentExpired(); error ResidualBalance();
    event IntentForwarded(bytes32 indexed intentHash,address indexed sender,uint256 indexed nonce,bytes32 executionHash,uint256 amountOut,bytes32 receiptHash);

    constructor(address hub,address solver_,address escrow_,address receipt_){
        if(hub==address(0)||solver_==address(0)||escrow_==address(0)||receipt_==address(0))revert InvalidAddress();
        intentHub=hub;solver=ILQCInternalSolverIntent(solver_);escrow=ILQCSourceEscrowIntent(escrow_);receipt=ILQCExecutionReceiptIntent(receipt_);
    }
    modifier onlyEscrow(){if(msg.sender!=address(escrow))revert UnauthorizedEscrow();_;}

    function executionHash(ILQCInternalSolverIntent.RouteIntent calldata r) public pure returns(bytes32){
        return keccak256(abi.encode(r.intentHash,r.dexId,r.tokenIn,r.tokenOut,r.amountIn,r.amountOutMinimum,r.recipient,r.deadline,keccak256(r.routeData)));
    }

    /// @dev Called only by SourceEscrow after it transfers this intent's exact input here.
    function forward(bytes32 canonicalIntentHash,address expectedSender,uint256 expectedNonce,ILQCInternalSolverIntent.RouteIntent calldata r)
        external onlyEscrow returns(uint256 amountOut,bytes32 receiptHash)
    {
        if(canonicalIntentHash==bytes32(0)||expectedSender==address(0)||r.intentHash!=canonicalIntentHash)revert InvalidIntent();
        (address sender,uint256 nonce,uint256 deadline,uint8 status)=escrow.intentRecord(canonicalIntentHash);
        if(status!=1)revert IntentNotPending();
        if(block.timestamp>deadline)revert IntentExpired();
        if(sender!=expectedSender||nonce!=expectedNonce||deadline!=r.deadline)revert IntentMismatch();
        (address escrowToken,uint256 escrowAmount)=escrow.escrows(canonicalIntentHash);
        if(escrowToken!=r.tokenIn||escrowAmount!=r.amountIn||_balance(r.tokenIn)!=r.amountIn)revert IntentMismatch();

        bytes32 boundExecutionHash=executionHash(r);
        r.tokenIn.safeTransfer(address(solver),r.amountIn);
        if(_balance(r.tokenIn)!=0)revert ResidualBalance();
        amountOut=solver.execute(r);
        receiptHash=receipt.record(canonicalIntentHash,boundExecutionHash,address(solver),r.dexId,amountOut);
        emit IntentForwarded(canonicalIntentHash,sender,nonce,boundExecutionHash,amountOut,receiptHash);
    }

    function _balance(address token) private view returns(uint256 value){
        (bool ok,bytes memory data)=token.staticcall(abi.encodeWithSignature("balanceOf(address)",address(this)));
        if(!ok||data.length<32)revert InvalidIntent();value=abi.decode(data,(uint256));
    }
}
