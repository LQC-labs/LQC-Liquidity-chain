// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// M20: six-decimal collateral integration in isolation; NEVER a production policy approval.
import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {LQCPerpEngineM18FeeRemainderCandidate as Engine} from "../dex/contracts/futures/LQCPerpEngineM18FeeRemainderCandidate.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {M20MockCollateral6 as Token} from "./mocks/M20MockCollateral6.sol";

interface M20Vm {
    function warp(uint256 timestamp) external;
    function prank(address account) external;
    function expectRevert(bytes4 selector) external;
}
contract LQCFuturesM20SixDecimalIntegrationTest {
    M20Vm private constant vm=M20Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant START=2_000_000_000;
    address private constant INDEX=address(0xB7C);
    address private constant USER=address(0xB22);
    Token private token;
    Registry private registry;
    Vault private vault;
    Engine private engine;
    Feed private feed;

    function setUp() public {
        vm.warp(START);
        token=new Token();
        registry=new Registry(address(this));
        vault=new Vault(address(this));
        engine=new Engine(address(registry),address(vault));
        vault.setEngine(address(engine));
        vault.setSupportedCollateral(address(token),true);
        Aggregator oracle=new Aggregator(address(this));
        feed=new Feed(8,50_000e8);
        oracle.setFeed(INDEX,address(feed),300);
        registry.addMarket("BTC/mUSD6",INDEX,address(token),address(oracle),100_000,500);
        (address source,uint32 heartbeat,address referenceFeed,uint16 deviation)=oracle.feedConfigs(INDEX);
        bytes32 config=keccak256(abi.encode(INDEX,source,heartbeat,referenceFeed,deviation));
        uint256 version=oracle.configVersion(INDEX);
        registry.approveAggregatorRecoveryOracle(1,address(oracle),address(oracle).codehash,config,version);
        registry.setMarketMode(1,Registry.MarketMode.REDUCE_ONLY);
        uint256 epoch=registry.recoveryApprovalEpoch(1);
        registry.approveRecoveryActivation(1,address(oracle),address(oracle).codehash,
            config,version,epoch,START+60);
        registry.activateMarket(1,epoch);
        token.mint(USER,3_000e6);
        vm.prank(USER);
        token.approve(address(vault),3_000e6);
        vm.prank(USER);
        vault.deposit(address(token),3_000e6);
    }

    function _assertConserved() internal view {
        uint256 available=vault.availableBalance(USER,address(token));
        uint256 locked=vault.lockedBalance(USER,address(token));
        uint256 accounted=vault.totalAccounted(address(token));
        uint256 reserved=vault.fundingPoolBalance(address(token))+
            vault.insuranceFeeReserve(address(token))+vault.treasuryFeeReserve(address(token));
        require(available+locked==accounted,"M20 user accounting mismatch");
        require(token.balanceOf(address(vault))>=accounted+reserved,"M20 underbacked");
    }

    function test_M20_ActualSixDecimalTokenRejectsE18NotionalBeforeAnyMutation() public {
        engine.configureTradingFee(1,100,6000);
        uint256 balance=vault.availableBalance(USER,address(token));
        vm.expectRevert(Engine.LeverageTooHigh.selector);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        require(vault.availableBalance(USER,address(token))==balance,"M20 failed trade charged six-dec token");
        require(vault.lockedBalance(USER,address(token))==0,"M20 failed trade locked six-dec token");
        require(engine.openInterestUsd(1)==0,"M20 failed trade created OI");
        require(vault.insuranceFeeReserve(address(token))==0,"M20 failed trade funded Insurance");
        _assertConserved();
    }

    function test_M20_SameScaleSixDecimalOpenFeeFundingCloseAndWithdraw() public {
        // Demonstrates an alternate six-decimal common scale, not USD-e18 compatibility.
        engine.configureTradingFee(1,100,6000);
        engine.configureFunding(1,1e25);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e6,true);
        require(vault.insuranceFeeReserve(address(token))==12e6,"M20 six-dec Insurance incorrect");
        require(vault.treasuryFeeReserve(address(token))==8e6,"M20 six-dec Treasury incorrect");
        require(vault.availableBalance(USER,address(token))==2_480e6,"M20 six-dec opening fee wrong");
        _assertConserved();

        engine.updateFundingIndex(1,int256(1e24));
        vm.prank(USER);
        engine.settleFunding(1);
        require(vault.fundingPoolBalance(address(token))==2e6,"M20 six-dec Funding debit incorrect");
        _assertConserved();

        feed.setAnswer(45_000e8); // 10% long loss = 200 six-dec synthetic units
        vm.prank(USER);
        engine.closePosition(1);
        require(engine.openInterestUsd(1)==0,"M20 six-dec position not cleared");
        require(vault.lockedBalance(USER,address(token))==0,"M20 six-dec margin locked after close");
        require(vault.insuranceFeeReserve(address(token))==24e6,"M20 six-dec close Insurance mismatch");
        require(vault.treasuryFeeReserve(address(token))==16e6,"M20 six-dec close Treasury mismatch");
        require(vault.fundingPoolBalance(address(token))==2e6,"M20 six-dec funding pool changed");
        require(vault.availableBalance(USER,address(token))==2_758e6,
            "M20 six-dec closed user balance incorrect");
        _assertConserved();

        vm.prank(USER);
        vault.withdraw(address(token),2_758e6);
        require(token.balanceOf(USER)==2_758e6,"M20 withdrawal settlement incorrect");
        require(vault.totalAccounted(address(token))==0,"M20 user liability retained");
        require(token.balanceOf(address(vault))==242e6,
            "M20 post-loss residual Vault balance incorrect");
        _assertConserved();
    }
}
