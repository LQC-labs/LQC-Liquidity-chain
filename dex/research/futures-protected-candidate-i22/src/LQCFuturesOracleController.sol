// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCAggregatorOracleAdapter} from "./baseline/LQCAggregatorOracleAdapter.sol";
interface IPolicyGovernance {function owner() external view returns(address);}
/// Owns the canonical Aggregator permanently. No ownership escape or raw call endpoint.
/// Versions only prove changes routed through this controller after adoption.
contract LQCFuturesOracleController {
    address public immutable registry;
    LQCAggregatorOracleAdapter public immutable aggregator;
    uint256 public policyVersion;
    error Forbidden();
    error NotAdopted();
    event PolicyVersionAdvanced(uint256 version);
    constructor(address registry_,address agg){registry=registry_;aggregator=LQCAggregatorOracleAdapter(agg);}
    modifier onlyGovernance(){if(msg.sender!=IPolicyGovernance(registry).owner())revert Forbidden();_;}
    function adoptAggregator() external onlyGovernance {
        if(policyVersion!=0||aggregator.pendingOwner()!=address(this))revert NotAdopted();
        aggregator.acceptOwnership();policyVersion=1;emit PolicyVersionAdvanced(1);
    }
    function _advance() private {
        if(policyVersion==0||aggregator.owner()!=address(this))revert NotAdopted();
        policyVersion++;emit PolicyVersionAdvanced(policyVersion);
    }
    function setFeed(address token,address feed,uint32 heartbeat) external onlyGovernance {
        _advance();aggregator.setFeed(token,feed,heartbeat);
    }
    function setCircuitBreaker(address token,address referenceFeed,uint16 deviation) external onlyGovernance {
        _advance();aggregator.setCircuitBreaker(token,referenceFeed,deviation);
    }
    function clearCircuitBreaker(address token) external onlyGovernance {
        _advance();aggregator.clearCircuitBreaker(token);
    }
}

