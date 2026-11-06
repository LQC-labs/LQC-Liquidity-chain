// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesApprovedOracle} from "./LQCFuturesApprovedOracle.sol";
import {LQCFuturesOracleController} from "./LQCFuturesOracleController.sol";
/// Immutable deployment-only helper. It has no approval state or governance escape.
contract LQCFuturesOracleFactory {
    address public immutable registry;
    error Forbidden();
    constructor(){registry=msg.sender;}
    modifier onlyRegistry(){if(msg.sender!=registry)revert Forbidden();_;}
    function createController(address agg) external onlyRegistry returns(address){
        return address(new LQCFuturesOracleController(registry,agg));
    }
    function createGuard(address token,address agg,address controller) external onlyRegistry returns(address){
        return address(new LQCFuturesApprovedOracle(registry,token,agg,controller));
    }
}
