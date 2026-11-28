// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCPerpEngine as Engine} from "../src/futures/LQCPerpEngine.sol";
import {LQCFuturesMarketRegistry as Registry} from "../src/futures/LQCFuturesMarketRegistry.sol";
import {LQCFuturesVault as Vault} from "../src/futures/LQCFuturesVault.sol";

interface VmShared28 { function prank(address sender) external; }

contract LQCSharedGuards28Test {
    VmShared28 private constant vm = VmShared28(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant outsider = address(0x1234);
    Engine private engine;
    Registry private registry;
    Vault private vault;

    function setUp() external {
        registry = new Registry(address(this));
        vault = new Vault(address(this));
        engine = new Engine(address(registry), address(vault));
    }

    function testFuzz_sharedGuardsRetainErrorsAndDoNotWrite(uint256 marketId) external {
        // The registry is empty, so every possible market ID is invalid.
        _reject(abi.encodeCall(engine.configureFunding, (marketId, 1)), Engine.FundingMarketNotFound.selector);
        _reject(abi.encodeCall(engine.configureMarketNotionalLimits, (marketId, 1, 1)), Engine.FundingMarketNotFound.selector);
        _reject(abi.encodeCall(engine.configureTradingFee, (marketId, 1, 1)), Engine.FundingMarketNotFound.selector);
        _reject(abi.encodeCall(engine.configureAdlSafety, (marketId, true, 1)), Engine.FundingMarketNotFound.selector);
        _reject(abi.encodeCall(engine.configurePartialLiquidation, (marketId, 1, 1)), Engine.FundingMarketNotFound.selector);
        _reject(abi.encodeCall(engine.configureInsuranceCoverage, (marketId, 1)), Engine.FundingMarketNotFound.selector);
        _reject(abi.encodeCall(engine.configureMarketOpenInterestLimit, (marketId, 1)), Engine.InvalidNotionalLimits.selector);
        require(engine.openInterestUsd(marketId) == 0 && engine.actionNonces(outsider) == 0);
    }

    function test_ownershipRotationInvalidatesPriorCaller() external {
        registry.transferOwnership(outsider);
        vm.prank(outsider);
        registry.acceptOwnership();
        bytes memory callData = abi.encodeCall(engine.configureFunding, (1, 1));
        _expect(callData, Engine.Forbidden.selector);
        vm.prank(outsider);
        _expect(callData, Engine.FundingMarketNotFound.selector);
    }

    function _reject(bytes memory callData, bytes4 ownerError) private {
        _expect(callData, ownerError);
        vm.prank(outsider);
        _expect(callData, Engine.Forbidden.selector);
    }

    function _expect(bytes memory callData, bytes4 errorId) private {
        (bool ok, bytes memory reason) = address(engine).call(callData);
        require(!ok && bytes4(reason) == errorId);
    }
}
