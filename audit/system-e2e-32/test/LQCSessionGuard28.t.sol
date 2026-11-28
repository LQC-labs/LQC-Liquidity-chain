// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCPerpEngine as Engine} from "../src/futures/LQCPerpEngine.sol";
import {LQCFuturesMarketRegistry as Registry} from "../src/futures/LQCFuturesMarketRegistry.sol";
import {LQCFuturesVault as Vault} from "../src/futures/LQCFuturesVault.sol";
import {LQCPythReferenceOracleWrapper as Wrapper} from "../src/futures/LQCPythReferenceOracleWrapper.sol";

contract LocalProofDependency28 {}
contract LocalProofOracle28 {
    address public constant indexToken = address(0xA1);
    address public constant quoteToken = address(0xA2);
    uint32 public constant cacheMaxAge = 120;
    uint32 public constant referenceMaxAge = 120;
    uint16 public constant maxDeviationBps = 100;
    uint8 public constant referenceDecimals = 8;
    uint256 public constant configVersion = 1;
    address public immutable cache = address(new LocalProofDependency28());
    address public immutable referenceFeed = address(new LocalProofDependency28());
    Engine private immutable engine;

    error InvalidProof();

    constructor(Engine engine_) { engine = engine_; }

    function cacheCodeHash() public view returns (bytes32) { return cache.codehash; }
    function referenceCodeHash() public view returns (bytes32) { return referenceFeed.codehash; }
    function configHash() external view returns (bytes32) {
        Wrapper.Policy memory policy = Wrapper.Policy(cacheMaxAge, referenceMaxAge, maxDeviationBps, referenceDecimals, configVersion);
        return keccak256(abi.encode(cache, referenceFeed, indexToken, quoteToken, cacheCodeHash(), referenceCodeHash(), policy));
    }

    function requiresSessionProof() external pure returns (bool) { return true; }
    function getPrice(address) external view returns (uint256, uint256) { return (100e18, block.timestamp); }

    function verifyExecutionPrice(uint256 marketId, address token, bytes calldata proof)
        external returns (uint256, uint256)
    {
        require(msg.sender == address(engine) && marketId == 1 && token == indexToken);
        if (keccak256(proof) != keccak256(hex"aa")) revert InvalidProof();
        (bool ok, bytes memory reason) = address(engine).call(abi.encodeCall(engine.liquidateWithProof, (address(this), marketId, hex"aa")));
        require(!ok && bytes4(reason) == Engine.WrapperExecutionUnavailable.selector);
        return (100e18, block.timestamp);
    }
}

contract LQCSessionGuard28Test {
    function test_failureLeavesSessionReusableAndRejectsNestedProof() external {
        Registry registry = new Registry(address(this));
        Vault vault = new Vault(address(this));
        Engine engine = new Engine(address(registry), address(vault));
        LocalProofOracle28 oracle = new LocalProofOracle28(engine);
        uint256 marketId = registry.addWrapperMarket("TEST", oracle.indexToken(), address(vault), address(oracle), 100_000, 500);
        bytes32 config = registry.wrapperApprovalConfigHash(marketId);
        uint256 version = registry.wrapperNominationVersion(marketId);
        uint256 deadline = block.timestamp + 60;
        registry.approveWrapperRecoveryOracle(marketId, address(oracle), address(oracle).codehash, config, version,
            registry.recoveryApprovalEpoch(marketId), deadline);
        uint256 epoch = registry.recoveryApprovalEpoch(marketId);
        registry.enterWrapperReduceOnly(marketId, epoch);
        registry.approveRecoveryActivation(marketId, address(oracle), address(oracle).codehash, config, version, epoch, deadline);
        registry.activateMarket(marketId, epoch);
        engine.configureFunding(marketId, 100);
        engine.updateFundingIndexWithProof(marketId, 1, hex"aa");
        (bool ok, bytes memory reason) = address(engine).call(abi.encodeCall(engine.updateFundingIndexWithProof, (marketId, 1, hex"55")));
        require(!ok && bytes4(reason) == LocalProofOracle28.InvalidProof.selector);
        (int256 afterFailure,,) = engine.fundingStates(marketId);
        require(afterFailure == 1);
        engine.updateFundingIndexWithProof(marketId, 1, hex"aa");
        (int256 finalIndex,,) = engine.fundingStates(marketId);
        require(finalIndex == 2 && registry.recoveryApprovalEpoch(marketId) == epoch);
    }
}
