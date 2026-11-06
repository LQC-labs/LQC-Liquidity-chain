// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCAggregatorOracleAdapter} from "./baseline/LQCAggregatorOracleAdapter.sol";
import {IAggregatorV3} from "./baseline/interfaces/IAggregatorV3.sol";
import {LQCFuturesOracleController} from "./LQCFuturesOracleController.sol";
interface IAdmissionRegistry {
    function isOracleApproved(address oracle, address token) external view returns (bool);
}
/// @notice Canonical non-upgradeable policy guard; created only by the candidate Registry.
/// @dev No provider authentication claim. Approved source code must be independently reviewed.
contract LQCFuturesApprovedOracle {
    address public immutable registry;
    address public immutable indexToken;
    LQCAggregatorOracleAdapter public immutable aggregator;
    address public immutable primaryFeed;
    address public immutable referenceFeed;
    bytes32 public immutable primaryHash;
    bytes32 public immutable referenceHash;
    address public immutable aggregatorOwner;
    uint32 public immutable heartbeat;
    uint8 public immutable primaryDecimals;
    uint8 public immutable referenceDecimals;
    LQCFuturesOracleController public immutable controller;
    uint256 public immutable approvedPolicyVersion;
    error PolicyChanged();
    constructor(address registry_,address token, address agg, address controller_) {
        registry = registry_;
        indexToken = token;
        aggregator = LQCAggregatorOracleAdapter(agg);
        controller=LQCFuturesOracleController(controller_);
        approvedPolicyVersion=controller.policyVersion();
        (address p,uint32 age,address r,uint16 deviation) = aggregator.feedConfigs(token);
        // Registry checks the canonical Aggregator before constructing this guard.
        // Registry alone admits guards it creates; no public "approve arbitrary address" exists.
        if (approvedPolicyVersion==0||aggregator.owner()!=controller_||
            controller.registry()!=registry_||address(controller.aggregator())!=agg||
            p == address(0) || r == address(0) || p == r || deviation != 500 || age == 0 || age > 300) revert PolicyChanged();
        primaryFeed=p;referenceFeed=r;heartbeat=age;
        primaryHash=p.codehash;referenceHash=r.codehash;
        aggregatorOwner=aggregator.owner();
        primaryDecimals=IAggregatorV3(p).decimals();
        referenceDecimals=IAggregatorV3(r).decimals();
        if(primaryDecimals>36||referenceDecimals>36) revert PolicyChanged();
    }
    function getPrice(address token) external view returns(uint256 price,uint256 updatedAt) {
        if(token!=indexToken || !IAdmissionRegistry(registry).isOracleApproved(address(this),token)||
            controller.policyVersion()!=approvedPolicyVersion) revert PolicyChanged();
        (address p,uint32 age,address r,uint16 deviation)=aggregator.feedConfigs(token);
        if(p!=primaryFeed||r!=referenceFeed||age!=heartbeat||deviation!=500 ||
            p.codehash!=primaryHash||r.codehash!=referenceHash||aggregator.owner()!=aggregatorOwner||
            IAggregatorV3(p).decimals()!=primaryDecimals||IAggregatorV3(r).decimals()!=referenceDecimals) revert PolicyChanged();
        return aggregator.getPrice(token);
    }
}

