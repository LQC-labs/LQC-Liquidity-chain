// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface ILQCExecutionRouterInternal {
    function swapExactInput(bytes32 dexId,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMinimum,address recipient,uint256 deadline,bytes calldata routeData) external returns(uint256 amountOut);
}

contract LQCInternalSolver {
    using SafeTransferLib for address;
    address public immutable executionBinding;
    ILQCExecutionRouterInternal public immutable executionRouter;
    uint256 private unlocked=1;

    error UnauthorizedBinding(); error InvalidAddress(); error InvalidIntent(); error Reentrancy(); error ResidualBalance();
    event InternalRouteExecuted(bytes32 indexed intentHash,bytes32 indexed dexId,address indexed recipient,uint256 amountIn,uint256 amountOut);

    struct RouteIntent {
        bytes32 intentHash; bytes32 dexId; address tokenIn; address tokenOut;
        uint256 amountIn; uint256 amountOutMinimum; address recipient; uint256 deadline; bytes routeData;
    }

    modifier onlyBinding(){if(msg.sender!=executionBinding)revert UnauthorizedBinding();_;}
    modifier nonReentrant(){if(unlocked!=1)revert Reentrancy();unlocked=2;_;unlocked=1;}

    constructor(address binding,address router){
        if(binding==address(0)||router==address(0))revert InvalidAddress();
        executionBinding=binding;executionRouter=ILQCExecutionRouterInternal(router);
    }

    /// @dev Tokens must be transferred by the authenticated Escrow -> Binding execution path.
    /// The solver grants only an exact temporary approval and must finish with zero tokenIn balance.
    function execute(RouteIntent calldata r) external onlyBinding nonReentrant returns(uint256 amountOut){
        if(r.intentHash==bytes32(0)||r.dexId==bytes32(0)||r.tokenIn==address(0)||r.tokenOut==address(0)||r.tokenIn==r.tokenOut||r.amountIn==0||r.amountOutMinimum==0||r.recipient==address(0)||r.deadline<block.timestamp)revert InvalidIntent();
        uint256 beforeBalance=_balance(r.tokenIn);
        if(beforeBalance!=r.amountIn)revert ResidualBalance();
        r.tokenIn.forceApprove(address(executionRouter),r.amountIn);
        amountOut=executionRouter.swapExactInput(r.dexId,r.tokenIn,r.tokenOut,r.amountIn,r.amountOutMinimum,r.recipient,r.deadline,r.routeData);
        r.tokenIn.forceApprove(address(executionRouter),0);
        if(_balance(r.tokenIn)!=0)revert ResidualBalance();
        emit InternalRouteExecuted(r.intentHash,r.dexId,r.recipient,r.amountIn,amountOut);
    }

    function _balance(address token) private view returns(uint256 value){
        (bool ok,bytes memory data)=token.staticcall(abi.encodeWithSignature("balanceOf(address)",address(this)));
        if(!ok||data.length<32)revert InvalidIntent();value=abi.decode(data,(uint256));
    }
}
