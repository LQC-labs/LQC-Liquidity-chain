// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesMarketRegistry as Registry} from "./compat/LegacyRegistry.sol";
import {LQCPerpEngine as Engine} from "../src/LQCPerpEngine.sol";
import {LQCFuturesVault as Vault} from "../src/LQCFuturesVault.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../src/baseline/LQCAggregatorOracleAdapter.sol";
import {LeafFeed,Vm} from "./RegistrySecurity.t.sol";
import {LQCFuturesOracleController} from "../src/LQCFuturesOracleController.sol";
contract TestCollateral {
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    function mint(address a,uint256 n) external {balanceOf[a]+=n;}
    function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
    function transfer(address to,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[to]+=n;return true;}
    function transferFrom(address from,address to,uint256 n) external returns(bool){allowance[from][msg.sender]-=n;balanceOf[from]-=n;balanceOf[to]+=n;return true;}
}
contract EngineRegistryIntegrationTest {
    Vm constant vm=Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    LQCFuturesOracleController controller;Registry reg;Engine engine;Vault vault;TestCollateral token;LeafFeed p;LeafFeed r;Aggregator agg;address oracle;uint256 id;
    function setUp() public {
        vm.warp(1000);reg=new Registry(address(this));p=new LeafFeed();r=new LeafFeed();agg=new Aggregator(address(this));controller=LQCFuturesOracleController(reg.createOracleController(address(agg)));agg.transferOwnership(address(controller));controller.adoptAggregator();
        controller.setFeed(address(42),address(p),300);controller.setCircuitBreaker(address(42),address(r),500);
        reg.sealOraclePolicy(address(p),address(r),keccak256("reviewed-fixtures"));
        oracle=reg.createApprovedOracle(address(42),address(agg),keccak256("observation"));
        token=new TestCollateral();vault=new Vault(address(this));engine=new Engine(address(reg),address(vault));
        vault.setEngine(address(engine));reg.bindRiskSource(address(engine),address(vault));vault.setSupportedCollateral(address(token),true);
        token.mint(address(this),1000e18);token.approve(address(vault),1000e18);vault.deposit(address(token),1000e18);
        id=reg.addMarket(bytes32("MARKET"),address(42),address(token),oracle,50000,500);
    }
    function activate() private {
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);reg.setRecoveryApproved(id,true);reg.setMarketActive(id,true);
    }
    function noEntryNoAccountingChange() private {
        uint256 available=vault.availableBalance(address(this),address(token));
        uint256 locked=vault.lockedBalance(address(this),address(token));
        uint256 oi=engine.openInterestUsd(id);uint256 accounted=vault.totalAccounted(address(token));
        vm.expectRevert(Engine.MarketInactive.selector);engine.openPosition(id,100e18,500e18,true);
        require(vault.availableBalance(address(this),address(token))==available);
        require(vault.lockedBalance(address(this),address(token))==locked);
        require(engine.openInterestUsd(id)==oi&&vault.totalAccounted(address(token))==accounted);
        require(vault.insuranceFeeReserve(address(token))==0&&vault.treasuryFeeReserve(address(token))==0);
    }
    function testOriginalEngineCannotOpenInitialHaltedMarket() public {noEntryNoAccountingChange();}
    function testOriginalEngineOpensApprovedActiveMarket() public {
        activate();engine.openPosition(id,100e18,500e18,true);
        require(vault.availableBalance(address(this),address(token))==900e18&&vault.lockedBalance(address(this),address(token))==100e18);
        require(engine.openInterestUsd(id)==500e18);
    }
    function testOriginalEngineRejectsClearedReferenceAtomically() public {activate();controller.clearCircuitBreaker(address(42));noEntryNoAccountingChange();}
    function testOriginalEngineRejectsChanged500PolicyAtomically() public {activate();controller.setCircuitBreaker(address(42),address(r),501);noEntryNoAccountingChange();}
    function testOriginalEngineRejectsStaleReferenceAtomically() public {activate();r.set(100e18,699);noEntryNoAccountingChange();}
    function testOriginalEngineRejectsRevokedOracleAtomically() public {activate();reg.revokeOracle(oracle);noEntryNoAccountingChange();}
    function testHealthyReduceOnlyAllowsUnchangedCloseAndConservesCollateral() public {
        activate();engine.openPosition(id,100e18,500e18,true);reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        engine.closePosition(id);
        require(engine.openInterestUsd(id)==0&&vault.lockedBalance(address(this),address(token))==0);
        require(vault.availableBalance(address(this),address(token))==1000e18&&vault.totalAccounted(address(token))==1000e18);
    }
    function testOracleFailureRollsBackOriginalCloseAndFundingState() public {
        activate();engine.configureFunding(id,1e27);engine.openPosition(id,100e18,500e18,true);
        engine.updateFundingIndex(id,1e24);
        require(engine.previewFundingPayment(address(this),id)!=0);
        int256 entry=engine.positionFundingEntryRay(address(this),id);
        r.setBroken(true);vm.expectRevert();engine.closePosition(id);
        require(engine.openInterestUsd(id)==500e18&&vault.lockedBalance(address(this),address(token))==100e18);
        require(engine.positionFundingEntryRay(address(this),id)==entry&&vault.fundingPoolBalance(address(token))==0);
        require(vault.availableBalance(address(this),address(token))==900e18);
    }
    function testOriginalLiquidationStillSettlesLossConservatively() public {
        activate();engine.openPosition(id,100e18,500e18,true);
        p.set(80e18,1000);r.set(80e18,1000);engine.liquidate(address(this),id);
        require(engine.openInterestUsd(id)==0&&vault.lockedBalance(address(this),address(token))==0);
        require(vault.availableBalance(address(this),address(token))==900e18);
        require(vault.insuranceFeeReserve(address(token))==0&&vault.residualBadDebt(address(token))==0);
    }
    function testCRealEngineCreatedDebtPreventsActiveRecovery() public {
        activate();engine.openPosition(id,100e18,500e18,true);
        p.set(70e18,1000);r.set(70e18,1000);engine.closePosition(id);
        require(vault.residualBadDebt(address(token))==50e18);
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        (bool verified,uint256 debt)=reg.verifiedResidualDebt(id);require(verified&&debt==50e18);
        vm.expectRevert(Registry.ResidualDebt.selector);reg.setRecoveryApproved(id,true);
    }
}

