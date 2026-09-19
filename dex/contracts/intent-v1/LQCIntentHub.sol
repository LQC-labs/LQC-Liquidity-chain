// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCSourceEscrow {
    function release(bytes32 intentHash,address recipient) external;
    function executeThrough(bytes32 intentHash,address executionTarget,bytes calldata executionCall) external returns(bytes memory);
    function intentRecord(bytes32 intentHash) external view returns(address sender,uint256 nonce,uint256 deadline,uint8 status);
}
interface ILQCIntentSolverBindingHub {
    struct RouteIntent {bytes32 intentHash;bytes32 dexId;address tokenIn;address tokenOut;uint256 amountIn;uint256 amountOutMinimum;address recipient;uint256 deadline;bytes routeData;}
    function forward(bytes32 canonicalIntentHash,address expectedSender,uint256 expectedNonce,RouteIntent calldata r) external returns(uint256 amountOut,bytes32 receiptHash);
}

contract LQCIntentHub {
    address public owner;
    address public guardian;
    address public solver;
    address public executionBinding;
    ILQCSourceEscrow public immutable escrow;
    bool public paused;

    error Unauthorized(); error Paused(); error InvalidAddress(); error IntentNotPending(); error IntentExpired(); error InvalidIntent();
    event SolverUpdated(address indexed solver); event GuardianUpdated(address indexed guardian);
    event ExecutionBindingUpdated(address indexed binding);
    event PausedState(bool paused); event IntentExecuted(bytes32 indexed intentHash,address indexed solver,address indexed recipient);
    event RoutedIntentExecuted(bytes32 indexed intentHash,address indexed operator,address indexed recipient,bytes32 executionHash,uint256 amountOut,bytes32 receiptHash);

    constructor(address escrow_,address owner_,address guardian_){
        if(escrow_==address(0)||owner_==address(0)||guardian_==address(0))revert InvalidAddress();
        escrow=ILQCSourceEscrow(escrow_);owner=owner_;guardian=guardian_;
    }
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyGuardianOrOwner(){if(msg.sender!=guardian&&msg.sender!=owner)revert Unauthorized();_;}
    modifier onlySolver(){if(msg.sender!=solver)revert Unauthorized();_;}
    modifier whenActive(){if(paused)revert Paused();_;}

    function setSolver(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();solver=next;emit SolverUpdated(next);}
    function setExecutionBinding(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();executionBinding=next;emit ExecutionBindingUpdated(next);}
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

    /// @notice Executes the canonical same-chain route and writes its receipt in one transaction.
    /// @dev Escrow marks the intent executed only after Binding, Solver, Router and Receipt all succeed.
    function executeRoutedIntent(address expectedSender,uint256 expectedNonce,ILQCIntentSolverBindingHub.RouteIntent calldata r)
        external onlySolver whenActive returns(uint256 amountOut,bytes32 receiptHash)
    {
        address binding=executionBinding;
        if(binding==address(0)||expectedSender==address(0)||r.intentHash==bytes32(0))revert InvalidIntent();
        (address sender,uint256 nonce,uint256 deadline,uint8 status)=escrow.intentRecord(r.intentHash);
        if(status!=1)revert IntentNotPending();
        if(block.timestamp>deadline)revert IntentExpired();
        if(sender!=expectedSender||nonce!=expectedNonce||deadline!=r.deadline)revert InvalidIntent();
        bytes memory result=escrow.executeThrough(
            r.intentHash,
            binding,
            abi.encodeCall(ILQCIntentSolverBindingHub.forward,(r.intentHash,expectedSender,expectedNonce,r))
        );
        (amountOut,receiptHash)=abi.decode(result,(uint256,bytes32));
        bytes32 executionHash=keccak256(abi.encode(r.intentHash,r.dexId,r.tokenIn,r.tokenOut,r.amountIn,r.amountOutMinimum,r.recipient,r.deadline,keccak256(r.routeData)));
        emit RoutedIntentExecuted(r.intentHash,msg.sender,r.recipient,executionHash,amountOut,receiptHash);
    }
}
