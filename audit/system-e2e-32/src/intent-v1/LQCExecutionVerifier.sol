// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LQCExecutionVerifier {
    struct Policy { uint256 maxGasOverrunBps; uint256 maxPriceImpactBps; uint256 maxMarketDeviationBps; }
    struct Expected { address solver; bytes32 quoteHash; uint256 minimumOut; uint256 quotedGas; uint256 referenceOut; }
    struct Actual { address solver; bytes32 quoteHash; uint256 amountOut; uint256 gasUsed; uint256 marketOut; }
    address public owner; address public reporter; Policy public policy;

    error Unauthorized(); error InvalidAddress(); error InvalidPolicy(); error IdentityMismatch();
    error InsufficientOutput(); error GasOverrun(); error PriceImpactExceeded(); error MarketDeviationExceeded();

    event ReporterUpdated(address indexed reporter); event PolicyUpdated(uint256 gasBps,uint256 impactBps,uint256 deviationBps);
    event ExecutionVerified(bytes32 indexed intentHash,address indexed solver,bytes32 indexed quoteHash,uint256 amountOut,uint256 gasUsed);

    constructor(address owner_,uint256 gasBps,uint256 impactBps,uint256 deviationBps){
        if(owner_==address(0))revert InvalidAddress();owner=owner_;_setPolicy(gasBps,impactBps,deviationBps);
    }
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyReporter(){if(msg.sender!=reporter)revert Unauthorized();_;}
    function setReporter(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();reporter=next;emit ReporterUpdated(next);}
    function setPolicy(uint256 a,uint256 b,uint256 c) external onlyOwner {_setPolicy(a,b,c);}
    function _setPolicy(uint256 a,uint256 b,uint256 c) internal {if(a>10000||b>10000||c>10000)revert InvalidPolicy();policy=Policy(a,b,c);emit PolicyUpdated(a,b,c);}

    function verify(bytes32 intentHash,Expected calldata e,Actual calldata a) external onlyReporter returns(bool){
        if(intentHash==bytes32(0)||e.solver==address(0)||e.quoteHash==bytes32(0)||e.minimumOut==0||e.referenceOut==0)revert InvalidPolicy();
        if(a.solver!=e.solver||a.quoteHash!=e.quoteHash)revert IdentityMismatch();
        if(a.amountOut<e.minimumOut)revert InsufficientOutput();
        uint256 allowedGas=e.quotedGas+(e.quotedGas*policy.maxGasOverrunBps/10000);
        if(a.gasUsed>allowedGas)revert GasOverrun();
        if(a.amountOut<e.referenceOut){
            uint256 impact=(e.referenceOut-a.amountOut)*10000/e.referenceOut;if(impact>policy.maxPriceImpactBps)revert PriceImpactExceeded();
        }
        if(a.marketOut>0&&a.amountOut<a.marketOut){
            uint256 deviation=(a.marketOut-a.amountOut)*10000/a.marketOut;if(deviation>policy.maxMarketDeviationBps)revert MarketDeviationExceeded();
        }
        emit ExecutionVerified(intentHash,a.solver,a.quoteHash,a.amountOut,a.gasUsed);return true;
    }
}
