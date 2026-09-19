// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILQCSolverRegistryView {
    function solvers(address solver) external view returns(uint256 bond,uint256 exposure,bool active);
}

contract LQCSolverReputation {
    struct Reputation { uint64 successes; uint64 failures; uint128 qualityPoints; uint128 qualitySamples; }
    mapping(address=>Reputation) public reputation;
    ILQCSolverRegistryView public immutable registry;
    address public owner;
    address public reporter;
    uint256 public minimumSuccessBps;

    error Unauthorized(); error InvalidAddress(); error InvalidScore(); error IneligibleSolver();
    event ReporterUpdated(address indexed reporter); event ResultRecorded(address indexed solver,bool success,uint256 qualityBps);

    constructor(address registry_,address owner_,uint256 minimumSuccessBps_){
        if(registry_==address(0)||owner_==address(0))revert InvalidAddress();
        if(minimumSuccessBps_>10000)revert InvalidScore();
        registry=ILQCSolverRegistryView(registry_);owner=owner_;minimumSuccessBps=minimumSuccessBps_;
    }
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyReporter(){if(msg.sender!=reporter)revert Unauthorized();_;}

    function setReporter(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();reporter=next;emit ReporterUpdated(next);}
    function setMinimumSuccessBps(uint256 next) external onlyOwner {if(next>10000)revert InvalidScore();minimumSuccessBps=next;}

    function recordResult(address solver,bool success,uint256 qualityBps) external onlyReporter {
        if(solver==address(0)||qualityBps>10000)revert InvalidScore();
        Reputation storage r=reputation[solver];
        if(success)r.successes++;else r.failures++;
        r.qualityPoints+=uint128(qualityBps);r.qualitySamples++;
        emit ResultRecorded(solver,success,qualityBps);
    }

    function successBps(address solver) public view returns(uint256){
        Reputation memory r=reputation[solver];uint256 total=uint256(r.successes)+uint256(r.failures);
        return total==0?10000:uint256(r.successes)*10000/total;
    }
    function averageQualityBps(address solver) public view returns(uint256){
        Reputation memory r=reputation[solver];return r.qualitySamples==0?10000:uint256(r.qualityPoints)/uint256(r.qualitySamples);
    }
    function eligible(address solver) external view returns(bool){
        (uint256 bond,uint256 exposure,bool active)=registry.solvers(solver);
        return active&&bond>0&&exposure<=bond&&successBps(solver)>=minimumSuccessBps;
    }
}
