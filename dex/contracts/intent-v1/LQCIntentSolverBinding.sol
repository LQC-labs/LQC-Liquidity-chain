// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCInternalSolverIntent {
    struct RouteIntent {bytes32 intentHash;bytes32 dexId;address tokenIn;address tokenOut;uint256 amountIn;uint256 amountOutMinimum;address recipient;uint256 deadline;bytes routeData;}
    function execute(RouteIntent calldata r) external returns(uint256 amountOut);
}
interface ILQCSourceEscrowIntent {
    function intentRecord(bytes32 intentHash) external view returns(address sender,uint256 nonce,uint256 deadline,uint8 status);
}

contract LQCIntentSolverBinding {
    ILQCInternalSolverIntent public immutable solver;
    ILQCSourceEscrowIntent public immutable escrow;
    address public immutable intentHub;

    error UnauthorizedHub(); error InvalidAddress(); error InvalidIntent(); error IntentMismatch(); error IntentNotPending(); error IntentExpired();
    event IntentForwarded(bytes32 indexed intentHash,address indexed sender,uint256 indexed nonce,bytes32 executionHash,uint256 amountOut);

    constructor(address hub,address solver_,address escrow_){
        if(hub==address(0)||solver_==address(0)||escrow_==address(0))revert InvalidAddress();
        intentHub=hub;solver=ILQCInternalSolverIntent(solver_);escrow=ILQCSourceEscrowIntent(escrow_);
    }
    modifier onlyHub(){if(msg.sender!=intentHub)revert UnauthorizedHub();_;}

    function executionHash(ILQCInternalSolverIntent.RouteIntent calldata r) public pure returns(bytes32){
        return keccak256(abi.encode(r.intentHash,r.dexId,r.tokenIn,r.tokenOut,r.amountIn,r.amountOutMinimum,r.recipient,r.deadline,keccak256(r.routeData)));
    }

    function forward(bytes32 canonicalIntentHash,address expectedSender,uint256 expectedNonce,ILQCInternalSolverIntent.RouteIntent calldata r) external onlyHub returns(uint256 amountOut){
        if(canonicalIntentHash==bytes32(0)||expectedSender==address(0)||r.intentHash!=canonicalIntentHash)revert InvalidIntent();
        (address sender,uint256 nonce,uint256 deadline,uint8 status)=escrow.intentRecord(canonicalIntentHash);
        if(status!=1)revert IntentNotPending();
        if(block.timestamp>deadline)revert IntentExpired();
        if(sender!=expectedSender||nonce!=expectedNonce||deadline!=r.deadline)revert IntentMismatch();
        bytes32 boundExecutionHash=executionHash(r);
        amountOut=solver.execute(r);
        emit IntentForwarded(canonicalIntentHash,sender,nonce,boundExecutionHash,amountOut);
    }
}
