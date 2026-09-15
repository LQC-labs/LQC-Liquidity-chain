// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {LQCQuoteTypes} from "./libraries/LQCQuoteTypes.sol";

interface ILQCBestExecutionProofGateway {
    function verifyBestCandidate(LQCQuoteTypes.QuoteRequest calldata request, LQCQuoteTypes.QuoteResult[] calldata candidates, bytes[] calldata routeData, uint256 selectedIndex) external view returns (bool);
    function bestCandidateProofHash(LQCQuoteTypes.QuoteRequest calldata request, LQCQuoteTypes.QuoteResult[] calldata candidates, uint256 selectedIndex) external pure returns (bytes32);
}

interface ILQCExecutionRouterGateway {
    function registry() external view returns (address);
    function swapExactInput(bytes32 dexId,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMinimum,address recipient,uint256 deadline,bytes calldata routeData) external returns (uint256 amountOut);
}

interface ILQCDexRegistryGateway {
    function getDex(bytes32 dexId) external view returns (address adapter, bool enabled, uint32 priority);
}

interface IERC20GatewayBalance { function balanceOf(address account) external view returns (uint256); }

/// @notice Atomically verifies, consumes and executes one on-chain best-candidate proof.
/// @dev This gateway is intentionally separate from the deployed Router 2.0 pilot.
contract LQCProofBoundExecutionGateway {
    using SafeTransferLib for address;

    ILQCBestExecutionProofGateway public immutable proofVerifier;
    ILQCExecutionRouterGateway public immutable executionRouter;
    mapping(bytes32 => bool) public consumedProof;
    uint256 private unlocked = 1;

    error ZeroAddress(); error InvalidProof(); error ProofAlreadyConsumed(); error RecipientMustBeSender();
    error RegistryAdapterChanged(); error ResidualToken(); error Reentrancy();

    event ProofBoundSwapExecuted(bytes32 indexed proofHash,address indexed sender,bytes32 indexed dexId,uint256 amountIn,uint256 amountOut);

    modifier nonReentrant(){if(unlocked!=1)revert Reentrancy();unlocked=2;_;unlocked=1;}

    constructor(address proofVerifier_,address executionRouter_){
        if(proofVerifier_==address(0)||executionRouter_==address(0))revert ZeroAddress();
        proofVerifier=ILQCBestExecutionProofGateway(proofVerifier_);
        executionRouter=ILQCExecutionRouterGateway(executionRouter_);
    }

    function executeBestCandidate(LQCQuoteTypes.QuoteRequest calldata request,LQCQuoteTypes.QuoteResult[] calldata candidates,bytes[] calldata routeData,uint256 selectedIndex) external nonReentrant returns(bytes32 proofHash,uint256 amountOut){
        if(request.recipient!=msg.sender)revert RecipientMustBeSender();
        if(!proofVerifier.verifyBestCandidate(request,candidates,routeData,selectedIndex))revert InvalidProof();
        proofHash=proofVerifier.bestCandidateProofHash(request,candidates,selectedIndex);
        if(proofHash==bytes32(0))revert InvalidProof();
        if(consumedProof[proofHash])revert ProofAlreadyConsumed();
        LQCQuoteTypes.QuoteResult calldata selected=candidates[selectedIndex];
        (address currentAdapter,bool enabled,)=ILQCDexRegistryGateway(executionRouter.registry()).getDex(selected.dexId);
        if(!enabled||currentAdapter!=selected.adapter)revert RegistryAdapterChanged();
        consumedProof[proofHash]=true;
        uint256 beforeBalance=IERC20GatewayBalance(request.tokenIn).balanceOf(address(this));
        request.tokenIn.safeTransferFrom(msg.sender,address(this),request.amountIn);
        request.tokenIn.forceApprove(address(executionRouter),request.amountIn);
        amountOut=executionRouter.swapExactInput(selected.dexId,request.tokenIn,request.tokenOut,request.amountIn,selected.minimumAmountOut,request.recipient,request.validUntil,routeData[selectedIndex]);
        request.tokenIn.forceApprove(address(executionRouter),0);
        if(IERC20GatewayBalance(request.tokenIn).balanceOf(address(this))!=beforeBalance)revert ResidualToken();
        emit ProofBoundSwapExecuted(proofHash,msg.sender,selected.dexId,request.amountIn,amountOut);
    }
}
