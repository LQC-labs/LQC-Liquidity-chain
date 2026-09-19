// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILQCSolverRegistryScore {
    function solvers(address solver) external view returns(uint256 bond,uint256 exposure,bool active);
}
interface ILQCSolverReputationScore {
    function successBps(address solver) external view returns(uint256);
    function averageQualityBps(address solver) external view returns(uint256);
    function eligible(address solver) external view returns(bool);
}

contract LQCBestExecutionScore {
    struct Quote { address solver; uint256 amountOut; uint256 gasCostOut; uint256 priceImpactBps; }
    ILQCSolverRegistryScore public immutable registry;
    ILQCSolverReputationScore public immutable reputation;
    uint256 public constant BPS=10000;
    uint256 public constant QUALITY_WEIGHT=1500;
    uint256 public constant SUCCESS_WEIGHT=1500;
    uint256 public constant CAPITAL_WEIGHT=1000;

    error InvalidAddress(); error InvalidQuote(); error NoEligibleSolver();

    constructor(address registry_,address reputation_){
        if(registry_==address(0)||reputation_==address(0))revert InvalidAddress();
        registry=ILQCSolverRegistryScore(registry_);reputation=ILQCSolverReputationScore(reputation_);
    }

    function score(Quote memory q) public view returns(uint256){
        if(q.solver==address(0)||q.amountOut==0||q.gasCostOut>=q.amountOut||q.priceImpactBps>BPS)revert InvalidQuote();
        if(!reputation.eligible(q.solver))revert NoEligibleSolver();
        (uint256 bond,uint256 exposure,bool active)=registry.solvers(q.solver);if(!active||bond==0||exposure>bond)revert NoEligibleSolver();
        uint256 netOut=q.amountOut-q.gasCostOut;
        uint256 quality=reputation.averageQualityBps(q.solver);
        uint256 success=reputation.successBps(q.solver);
        uint256 freeCapitalBps=(bond-exposure)*BPS/bond;
        uint256 reliability=quality*QUALITY_WEIGHT/BPS+success*SUCCESS_WEIGHT/BPS+freeCapitalBps*CAPITAL_WEIGHT/BPS;
        uint256 executionBps=BPS-q.priceImpactBps;
        return netOut*(executionBps+reliability)/BPS;
    }

    function selectBest(Quote[] calldata quotes) external view returns(address solver,uint256 bestScore,uint256 netAmountOut){
        for(uint256 i=0;i<quotes.length;i++){
            Quote memory q=quotes[i];if(!reputation.eligible(q.solver)||q.amountOut==0||q.gasCostOut>=q.amountOut||q.priceImpactBps>BPS)continue;
            (uint256 bond,uint256 exposure,bool active)=registry.solvers(q.solver);if(!active||bond==0||exposure>bond)continue;
            uint256 candidate=score(q),net=q.amountOut-q.gasCostOut;
            if(candidate>bestScore||(candidate==bestScore&&net>netAmountOut)||(candidate==bestScore&&net==netAmountOut&&uint160(q.solver)<uint160(solver))){
                solver=q.solver;bestScore=candidate;netAmountOut=net;
            }
        }
        if(solver==address(0))revert NoEligibleSolver();
    }
}
