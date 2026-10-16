// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILQCSolverReputationFeedback {
    function recordResult(address solver,bool success,uint256 qualityBps) external;
}
contract LQCSolverFeedback {
    struct Result { address solver; bool success; uint256 qualityBps; bool recorded; }
    mapping(bytes32=>Result) public results;
    ILQCSolverReputationFeedback public immutable reputation;
    address public owner;
    address public verifier;

    error Unauthorized(); error InvalidAddress(); error InvalidResult(); error ResultAlreadyRecorded();
    event VerifierUpdated(address indexed verifier);
    event FeedbackRecorded(bytes32 indexed intentHash,address indexed solver,bool success,uint256 qualityBps);

    constructor(address reputation_,address owner_){
        if(reputation_==address(0)||owner_==address(0))revert InvalidAddress();
        reputation=ILQCSolverReputationFeedback(reputation_);owner=owner_;
    }
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyVerifier(){if(msg.sender!=verifier)revert Unauthorized();_;}

    function setVerifier(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();verifier=next;emit VerifierUpdated(next);}

    function recordVerifiedResult(bytes32 intentHash,address solver,bool success,uint256 qualityBps) external onlyVerifier {
        if(intentHash==bytes32(0)||solver==address(0)||qualityBps>10000)revert InvalidResult();
        if(results[intentHash].recorded)revert ResultAlreadyRecorded();
        results[intentHash]=Result(solver,success,qualityBps,true);
        reputation.recordResult(solver,success,qualityBps);
        emit FeedbackRecorded(intentHash,solver,success,qualityBps);
    }
}
