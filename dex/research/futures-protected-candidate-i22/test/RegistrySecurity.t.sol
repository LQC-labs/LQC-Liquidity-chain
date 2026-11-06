// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesMarketRegistry as Registry} from "./compat/LegacyRegistry.sol";
import {LQCFuturesApprovedOracle as Guard} from "../src/LQCFuturesApprovedOracle.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../src/baseline/LQCAggregatorOracleAdapter.sol";
import {LQCFuturesMarketRegistry as OriginalRegistry} from "../baseline/OriginalRegistry.sol";
import {LQCFuturesOracleController} from "../src/LQCFuturesOracleController.sol";
import {LQCPerpEngine as RiskEngine} from "../src/LQCPerpEngine.sol";
import {LQCFuturesVault as RiskVault} from "../src/LQCFuturesVault.sol";
import {LQCFuturesOracleFactory} from "../src/LQCFuturesOracleFactory.sol";
interface Vm {
    function warp(uint256) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function prank(address) external;
    function etch(address,bytes calldata) external;
    function store(address,bytes32,bytes32) external;
}
/// Local immutable-type leaf fixture: mutable quotes, no external dependencies or proxy behavior.
contract LeafFeed {
    int256 public answer=100e18;
    uint256 public time=1000;
    uint8 public precision=18;
    bool public broken;
    function set(int256 p,uint256 t) external {answer=p;time=t;}
    function setDecimals(uint8 d) external {precision=d;}
    function setBroken(bool b) external {broken=b;}
    function decimals() external view returns(uint8){return precision;}
    function latestRoundData() external view returns(uint80,int256,uint256,uint256,uint80){
        require(!broken,"unavailable");return(1,answer,time,time,1);
    }
}
contract UnsupportedProxy {
    address public target;
    constructor(address a){target=a;}
    fallback() external {
        address a=target;
        assembly { calldatacopy(0,0,calldatasize()) let ok:=delegatecall(gas(),a,0,calldatasize(),0,0) returndatacopy(0,0,returndatasize()) if iszero(ok){revert(0,returndatasize())} return(0,returndatasize()) }
    }
}
contract FakeZeroDebtSource {
    address private claimedRegistry;
    constructor(address r){claimedRegistry=r;}
    function registry() external view returns(address){return claimedRegistry;}
    function vault() external view returns(address){return address(this);}
    function engine() external view returns(address){return address(this);}
    function owner() external pure returns(address){return address(1);}
    function residualBadDebt(address) external pure returns(uint256){return 0;}
}
contract RegistrySecurityTest {
    Vm constant vm=Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant TOKEN=address(42);
    address constant COLLATERAL=address(43);
    address constant GUARDIAN=address(99);
    Registry reg;
    LQCFuturesOracleController controller;
    RiskEngine riskEngine;
    RiskVault riskVault;
    LeafFeed p; LeafFeed r;
    Aggregator agg; address oracle; uint256 id;
    function setUp() public {
        vm.warp(1000);reg=new Registry(address(this));p=new LeafFeed();r=new LeafFeed();
        agg=new Aggregator(address(this));controller=LQCFuturesOracleController(reg.createOracleController(address(agg)));agg.transferOwnership(address(controller));controller.adoptAggregator();controller.setFeed(TOKEN,address(p),300);controller.setCircuitBreaker(TOKEN,address(r),500);
        reg.sealOraclePolicy(address(p),address(r),keccak256("reviewed-fixture-types"));
        oracle=reg.createApprovedOracle(TOKEN,address(agg),keccak256("independent-observation-fixture"));
        id=reg.addMarket(bytes32("BNB"),TOKEN,COLLATERAL,oracle,50000,500);
        reg.setGuardian(GUARDIAN);
        riskVault=new RiskVault(address(this));riskEngine=new RiskEngine(address(reg),address(riskVault));
        riskVault.setEngine(address(riskEngine));riskVault.setSupportedCollateral(COLLATERAL,true);reg.bindRiskSource(address(riskEngine),address(riskVault));
    }
    function active() private view returns(bool) { (,,,,,,bool a)=reg.markets(id);return a; }
    function arm() private {reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);reg.setRecoveryApproved(id,true);}
    function activate() private {arm();reg.setMarketMode(id,Registry.MarketMode.ACTIVE);}
    function newOracle() private returns(address) {
        Aggregator a=new Aggregator(address(this));a.setFeed(TOKEN,address(p),300);a.setCircuitBreaker(TOKEN,address(r),500);
        LQCFuturesOracleController next=LQCFuturesOracleController(reg.createOracleController(address(a)));a.transferOwnership(address(next));next.adoptAggregator();
        return reg.createApprovedOracle(TOKEN,address(a),keccak256("new-observation"));
    }
    function testInitialStateIsHaltedAndInactive() public view {require(reg.marketMode(id)==Registry.MarketMode.HALTED&&!active());}
    function testOwnerCannotReplaceSealedPolicy() public {
        vm.expectRevert(Registry.PolicyLocked.selector);reg.sealOraclePolicy(address(p),address(r),bytes32(uint256(1)));
    }
    function testUnapprovedOracleAddRejected() public {
        vm.expectRevert(Registry.OracleNotApproved.selector);reg.addMarket(bytes32("BAD"),TOKEN,COLLATERAL,address(agg),50000,500);
    }
    function testUnapprovedOracleReplacementRejected() public {
        vm.expectRevert(Registry.OracleNotApproved.selector);reg.setOracle(id,address(agg));
    }
    function testWrongTokenApprovalRejected() public {
        vm.expectRevert(Registry.OracleNotApproved.selector);reg.addMarket(bytes32("BAD"),address(77),COLLATERAL,oracle,50000,500);
    }
    function testOwnerCannotAdmitFakeAggregator() public {
        vm.expectRevert(Registry.OracleNotApproved.selector);reg.createApprovedOracle(TOKEN,address(p),bytes32(uint256(1)));
    }
    function testProxyTemplateUnsupportedEvenForOwner() public {
        Registry fresh=new Registry(address(this));UnsupportedProxy proxy=new UnsupportedProxy(address(p));
        vm.expectRevert(Registry.UnsupportedSource.selector);fresh.sealOraclePolicy(address(proxy),address(r),bytes32(uint256(1)));
    }
    function testExternalDependencyTemplateUnsupported() public {
        Registry fresh=new Registry(address(this));
        vm.expectRevert(Registry.UnsupportedSource.selector);fresh.sealOraclePolicy(address(agg),address(r),bytes32(uint256(1)));
    }
    function testEmptyEvidenceRejected() public {
        vm.expectRevert(Registry.OracleNotApproved.selector);reg.createApprovedOracle(TOKEN,address(agg),bytes32(0));
    }
    function testNoActiveRecoveryViaModeWithoutApproval() public {
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketMode(id,Registry.MarketMode.ACTIVE);
    }
    function testNoActiveRecoveryViaEmergencyWithoutApproval() public {
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setEmergencyMarketMode(id,Registry.MarketMode.ACTIVE);
    }
    function testNoActiveRecoveryViaBoolWithoutApproval() public {
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(id,true);
    }
    function testHaltedToActiveForbiddenEvenWithOwner() public {
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketMode(id,Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setEmergencyMarketMode(id,Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(id,true);
    }
    function testApprovalCannotBeIssuedWhileHalted() public {
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setRecoveryApproved(id,true);
    }
    function testApprovedRecoveryViaMode() public {activate();require(active()&&!reg.recoveryApproved(id));}
    function testApprovedRecoveryViaEmergency() public {arm();reg.setEmergencyMarketMode(id,Registry.MarketMode.ACTIVE);require(active());}
    function testApprovedRecoveryViaBool() public {arm();reg.setMarketActive(id,true);require(active());}
    function testApprovalExpiresExactlyAt15Minutes() public {
        arm();vm.warp(1900);p.set(100e18,1900);r.set(100e18,1900);
        require(!reg.recoveryApproved(id));
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketMode(id,Registry.MarketMode.ACTIVE);
    }
    function testApprovalWorksJustBeforeExpiry() public {
        arm();vm.warp(1899);p.set(100e18,1899);r.set(100e18,1899);
        reg.setMarketMode(id,Registry.MarketMode.ACTIVE);require(active());
    }
    function testApprovalIsOneUse() public {
        activate();reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketMode(id,Registry.MarketMode.ACTIVE);
    }
    function testOracleChangeImmediatelyInvalidatesApproval() public {
        address next=newOracle();arm();reg.setOracle(id,next);require(!reg.recoveryApproved(id));
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketMode(id,Registry.MarketMode.ACTIVE);
    }
    function testOracleChangeWhileActiveForbidden() public {
        address next=newOracle();activate();
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setOracle(id,next);require(active());
    }
    function testOwnerRevocationBlocksEntryWithoutEngineModification() public {
        activate();reg.revokeOracle(oracle);require(!active());
    }
    function testOwnerCannotReenableRevokedOracleViaRecovery() public {
        arm();reg.revokeOracle(oracle);require(!reg.recoveryApproved(id));
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(id,true);
    }
    function testReferenceRemovalBlocksEntryLive() public {activate();controller.clearCircuitBreaker(TOKEN);require(!active());}
    function test501DeviationBlocksEntryLive() public {activate();controller.setCircuitBreaker(TOKEN,address(r),501);require(!active());}
    function test499DeviationBlocksEntryLive() public {activate();controller.setCircuitBreaker(TOKEN,address(r),499);require(!active());}
    function testPrimaryChangeClearsReferenceAndBlocksEntry() public {activate();LeafFeed q=new LeafFeed();controller.setFeed(TOKEN,address(q),300);require(!active());}
    function testRestoredBreakerWithNewPrimaryStillBlocked() public {
        activate();LeafFeed q=new LeafFeed();controller.setFeed(TOKEN,address(q),300);controller.setCircuitBreaker(TOKEN,address(r),500);require(!active());
    }
    function testStaleReferenceBlocksLiveEntry() public {activate();r.set(100e18,699);require(!active());}
    function testStalePrimaryBlocksLiveEntry() public {activate();p.set(100e18,699);require(!active());}
    function testFutureReferenceBlocksLiveEntry() public {activate();r.set(100e18,1001);require(!active());}
    function testPriceDeviationBlocksLiveEntry() public {activate();r.set(90e18,1000);require(!active());}
    function testReferenceRevertBlocksLiveEntry() public {activate();r.setBroken(true);require(!active());}
    function testRecoveryRechecksHealthOnEveryPath() public {
        arm();r.setBroken(true);
        vm.expectRevert(Registry.OracleUnhealthy.selector);reg.setMarketMode(id,Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.OracleUnhealthy.selector);reg.setEmergencyMarketMode(id,Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.OracleUnhealthy.selector);reg.setMarketActive(id,true);
        require(reg.recoveryApproved(id));require(!active());
    }
    function testDecimalsChangeRequiresNewApproval() public {activate();p.setDecimals(8);require(!active());}
    function testFeedCodeChangeRequiresNewApproval() public {
        activate();vm.etch(address(r),hex"60006000fd");require(!active());
    }
    function testAggregatorOwnerChangeRequiresNewApproval() public {
        activate();vm.expectRevert(Aggregator.Forbidden.selector);agg.transferOwnership(address(88));require(active());
    }
    function testGuardianCanHaltAndInvalidatesApproval() public {
        arm();vm.prank(GUARDIAN);reg.setEmergencyMarketMode(id,Registry.MarketMode.HALTED);require(!reg.recoveryApproved(id));
    }
    function testGuardianCannotLoosen() public {
        vm.prank(GUARDIAN);vm.expectRevert(Registry.Forbidden.selector);reg.setEmergencyMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
    }
    function testGuardianCannotActivateEvenWithApproval() public {
        arm();vm.prank(GUARDIAN);vm.expectRevert(Registry.Forbidden.selector);reg.setEmergencyMarketMode(id,Registry.MarketMode.ACTIVE);
    }
    function testGuardianCannotApproveOracle() public {
        vm.prank(GUARDIAN);vm.expectRevert(Registry.Forbidden.selector);reg.createApprovedOracle(TOKEN,address(agg),bytes32(uint256(1)));
    }
    function testGuardianCannotApproveRecovery() public {
        arm();vm.prank(GUARDIAN);vm.expectRevert(Registry.Forbidden.selector);reg.setRecoveryApproved(id,true);
    }
    function testHealthyBooleansDoNotOverrideRealOracleFailure() public {
        activate();r.setBroken(true);vm.prank(GUARDIAN);reg.applyEmergencyTriggers(id,true,true,false);
        require(reg.marketMode(id)==Registry.MarketMode.HALTED&&!active());
    }
    function testRiskChangeInvalidatesRecovery() public {
        arm();reg.setRiskParameters(id,40000,600);require(!reg.recoveryApproved(id));
    }
    function testOwnershipChangeInvalidatesRecovery() public {
        arm();reg.transferOwnership(address(77));vm.prank(address(77));reg.acceptOwnership();require(!reg.recoveryApproved(id));
    }
    function testSetActiveFalseKeepsModeAndFlagConsistent() public {
        activate();reg.setMarketActive(id,false);require(reg.marketMode(id)==Registry.MarketMode.HALTED&&!active());
    }
    function testSafeOracleMigration() public {
        activate();reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);address next=newOracle();reg.setOracle(id,next);
        require(!reg.recoveryApproved(id)&&!active());reg.setRecoveryApproved(id,true);reg.setMarketActive(id,true);require(active());
    }
    function testZeroPriceBlocksApprovalAndRecovery() public {
        arm();p.set(0,1000);
        vm.expectRevert(Registry.OracleUnhealthy.selector);reg.setMarketActive(id,true);require(!active());
    }
    function testMarketTupleCompatibility() public view {
        (bytes32 symbol,address token,address collateral,address o,uint32 lev,uint32 maintenance,bool a)=reg.markets(id);
        require(symbol==bytes32("BNB")&&token==TOKEN&&collateral==COLLATERAL&&o==oracle&&lev==50000&&maintenance==500&&!a);
    }
    function testGasBaselineAddMarket() public {
        OriginalRegistry old=new OriginalRegistry(address(this));
        old.addMarket(bytes32("OLD"),TOKEN,COLLATERAL,address(agg),50000,500);
    }

    function testCVersionChangeRestoreCannotReusePendingApproval() public {
        arm();uint256 oldVersion=controller.policyVersion();
        controller.setFeed(TOKEN,address(p),299);
        controller.setFeed(TOKEN,address(p),300);
        controller.setCircuitBreaker(TOKEN,address(r),500);
        require(controller.policyVersion()>oldVersion);
        require(!reg.isOracleApproved(oracle,TOKEN)&&!reg.recoveryApproved(id));
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(id,true);
    }
    function testCVersionChangeRestoreCannotResumeActiveTrading() public {
        activate();controller.setCircuitBreaker(TOKEN,address(r),501);
        controller.setCircuitBreaker(TOKEN,address(r),500);
        require(!active()&&!reg.isOracleApproved(oracle,TOKEN));
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(id,true);
    }
    function testCNoOpConfigChangeAlsoInvalidatesVersion() public {
        activate();controller.setCircuitBreaker(TOKEN,address(r),500);require(!active());
    }
    function testCDirectConfigBypassRejectedByOwnership() public {
        activate();uint256 version=controller.policyVersion();
        vm.expectRevert(Aggregator.Forbidden.selector);agg.setFeed(TOKEN,address(p),299);
        require(controller.policyVersion()==version&&active());
    }
    function testCVersionedPolicyNeedsNewOracleAndNewRecoveryApproval() public {
        arm();controller.clearCircuitBreaker(TOKEN);controller.setCircuitBreaker(TOKEN,address(r),500);
        address next=reg.createApprovedOracle(TOKEN,address(agg),keccak256("fresh-review"));
        reg.setOracle(id,next);require(!reg.recoveryApproved(id));
        reg.setRecoveryApproved(id,true);reg.setMarketActive(id,true);require(active());
    }
    function testCUncontrolledAggregatorCannotBeAdmitted() public {
        Aggregator uncontrolled=new Aggregator(address(this));
        uncontrolled.setFeed(TOKEN,address(p),300);uncontrolled.setCircuitBreaker(TOKEN,address(r),500);
        vm.expectRevert(Registry.OracleNotApproved.selector);reg.createApprovedOracle(TOKEN,address(uncontrolled),bytes32(uint256(1)));
    }
    function testCRepeatDebtSignalInReduceOnlyInvalidatesApproval() public {
        arm();uint256 nonce=reg.policyNonce(id);
        vm.prank(GUARDIAN);reg.applyEmergencyTriggers(id,true,true,true);
        require(reg.marketMode(id)==Registry.MarketMode.REDUCE_ONLY&&!reg.recoveryApproved(id));
        require(reg.policyNonce(id)==nonce+1);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(id,true);
    }
    function testCRepeatedDebtSignalsInvalidateEveryApprovalGeneration() public {
        arm();vm.prank(GUARDIAN);reg.applyEmergencyTriggers(id,true,true,true);
        reg.setRecoveryApproved(id,true);uint256 nonce=reg.policyNonce(id);
        vm.prank(GUARDIAN);reg.applyEmergencyTriggers(id,true,true,true);
        require(!reg.recoveryApproved(id)&&reg.policyNonce(id)==nonce+1);
    }
    function testCRepeatHaltedRiskSignalStillAdvancesNonce() public {
        uint256 nonce=reg.policyNonce(id);
        vm.prank(GUARDIAN);reg.applyEmergencyTriggers(id,false,true,false);
        require(reg.marketMode(id)==Registry.MarketMode.HALTED&&reg.policyNonce(id)==nonce+1);
    }
    function testCActualDebtRejectsAllActiveRecoveryPaths() public {
        arm();vm.prank(address(riskEngine));riskVault.coverBadDebt(COLLATERAL,1e18,0);
        (bool verified,uint256 debt)=reg.verifiedResidualDebt(id);require(verified&&debt==1e18);
        vm.expectRevert(Registry.ResidualDebt.selector);reg.setMarketMode(id,Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.ResidualDebt.selector);reg.setEmergencyMarketMode(id,Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.ResidualDebt.selector);reg.setMarketActive(id,true);
    }
    function testCActualDebtBlocksLiveNewEntryBeforeMonitorSignal() public {
        activate();vm.prank(address(riskEngine));riskVault.coverBadDebt(COLLATERAL,1e18,0);require(!active());
    }
    function testCUnknownRiskBlocksLiveNewEntryBeforeMonitorSignal() public {
        activate();riskVault.setEngine(address(77));require(!active());
    }
    function testCActualDebtRejectsFreshApproval() public {
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        vm.prank(address(riskEngine));riskVault.coverBadDebt(COLLATERAL,1e18,0);
        vm.expectRevert(Registry.ResidualDebt.selector);reg.setRecoveryApproved(id,true);
    }
    function testCFalseDebtBooleanCannotHideActualDebt() public {
        activate();vm.prank(address(riskEngine));riskVault.coverBadDebt(COLLATERAL,1e18,0);
        vm.prank(GUARDIAN);reg.applyEmergencyTriggers(id,true,true,false);
        require(reg.marketMode(id)==Registry.MarketMode.REDUCE_ONLY&&!reg.recoveryApproved(id));
    }
    function testCUnverifiableRiskSourceRejectsRecovery() public {
        arm();vm.etch(address(riskEngine),hex"60006000fd");
        (bool verified,)=reg.verifiedResidualDebt(id);require(!verified);
        vm.expectRevert(Registry.RiskUnverified.selector);reg.setMarketActive(id,true);
    }
    function testCFakeZeroDebtGetterCannotBeRiskSource() public {
        Registry fresh=new Registry(address(this));
        vm.expectRevert(Registry.RiskUnverified.selector);fresh.bindRiskSource(address(riskEngine),address(riskVault));
    }
    function testCSelfReportedZeroDebtDoesNotAuthenticateCode() public {
        Registry fresh=new Registry(address(this));FakeZeroDebtSource fake=new FakeZeroDebtSource(address(fresh));
        require(fake.residualBadDebt(COLLATERAL)==0&&fake.registry()==address(fresh));
        vm.expectRevert(Registry.RiskUnverified.selector);fresh.bindRiskSource(address(fake),address(fake));
    }
    function testCUnboundRiskSourceCannotApproveRecovery() public {
        Registry fresh=new Registry(address(this));Aggregator a=new Aggregator(address(this));
        a.setFeed(TOKEN,address(p),300);a.setCircuitBreaker(TOKEN,address(r),500);
        fresh.sealOraclePolicy(address(p),address(r),keccak256("reviewed-types"));
        LQCFuturesOracleController c=LQCFuturesOracleController(fresh.createOracleController(address(a)));
        a.transferOwnership(address(c));c.adoptAggregator();
        address o=fresh.createApprovedOracle(TOKEN,address(a),keccak256("review"));
        uint256 m=fresh.addMarket(bytes32("UNKNOWN"),TOKEN,COLLATERAL,o,50000,500);
        fresh.setMarketMode(m,Registry.MarketMode.REDUCE_ONLY);
        vm.expectRevert(Registry.RiskUnverified.selector);fresh.setRecoveryApproved(m,true);
    }
    function testCRiskSourceCannotBeReboundByOwner() public {
        vm.expectRevert(Registry.PolicyLocked.selector);reg.bindRiskSource(address(riskEngine),address(riskVault));
    }
    function testCRiskBindingChangeBlocksApproval() public {
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);riskVault.setEngine(address(77));
        vm.expectRevert(Registry.RiskUnverified.selector);reg.setRecoveryApproved(id,true);
    }
    function testCUnknownRiskSignalHaltsEvenWithHealthyInputFlags() public {
        activate();riskVault.setEngine(address(77));
        vm.prank(GUARDIAN);reg.applyEmergencyTriggers(id,true,true,false);
        require(reg.marketMode(id)==Registry.MarketMode.HALTED);
    }
    function testCEveryImmutableOccurrenceMustMatchReviewedBindings() public {
        bytes memory original=address(riskEngine).code;
        uint256[32] memory offsets=[uint256(928),1195,1264,2396,3316,4819,6156,7167,7712,8314,8450,9785,9991,10144,10710,11736,12003,13001,13342,13574,13799,14183,14822,15065,15149,16451,17252,17515,17551,18590,18928,19302];
        for(uint256 i;i<offsets.length;i++){
            bytes memory bad=abi.encodePacked(original);bad[offsets[i]+31]=bytes1(uint8(bad[offsets[i]+31])^1);
            vm.etch(address(riskEngine),bad);
            (bool verified,)=reg.verifiedResidualDebt(id);require(!verified);
        }
        vm.etch(address(riskEngine),original);(bool good,)=reg.verifiedResidualDebt(id);require(good);
    }
    function testDFactoryPinnedToRegistry() public view {
        require(reg.oracleFactory().registry()==address(reg));
    }
    function testDFactoryRejectsDirectGovernanceControllerMint() public {
        LQCFuturesOracleFactory factory=reg.oracleFactory();
        vm.expectRevert(LQCFuturesOracleFactory.Forbidden.selector);
        factory.createController(address(agg));
    }
    function testDFactoryRejectsDirectGovernanceGuardMint() public {
        LQCFuturesOracleFactory factory=reg.oracleFactory();
        vm.expectRevert(LQCFuturesOracleFactory.Forbidden.selector);
        factory.createGuard(TOKEN,address(agg),address(controller));
    }
    function testDFactoryRejectsForeignRegistryCaller() public {
        Registry foreign=new Registry(address(this));
        LQCFuturesOracleFactory factory=reg.oracleFactory();
        vm.prank(address(foreign));vm.expectRevert(LQCFuturesOracleFactory.Forbidden.selector);
        factory.createController(address(agg));
    }
    function testDFactoryPreservesGuardAndControllerBindings() public view {
        require(Guard(oracle).registry()==address(reg)&&controller.registry()==address(reg));
        require(address(Guard(oracle).controller())==address(controller));
        require(Guard(oracle).approvedPolicyVersion()==controller.policyVersion());
    }
    function testDPackedPublicGetterValuesPreserved() public {
        (address token,bytes32 code,bytes32 evidence,uint256 version,bool approved,address ctrl,uint256 pv)=reg.oracleApprovals(oracle);
        require(token==TOKEN&&code==oracle.codehash&&evidence==keccak256("independent-observation-fixture")&&version==1&&approved);
        require(ctrl==address(controller)&&pv==controller.policyVersion());
        arm();
        (address o,uint256 ov,uint256 nonce,uint256 epoch,uint256 expires)=reg.recoveryApprovals(id);
        require(o==oracle&&ov==1&&nonce==reg.policyNonce(id)&&epoch==reg.ownershipEpoch()&&expires==1900);
    }
    function testDPolicyVersionDoesNotTruncateOrResurrectApproval() public {
        // Boundary injection only: controller's sole mutable variable is slot0.
        vm.store(address(controller),bytes32(0),bytes32(uint256(type(uint64).max)));
        address next=reg.createApprovedOracle(TOKEN,address(agg),keccak256("max-policy-version"));
        reg.setOracle(id,next);reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        reg.setRecoveryApproved(id,true);require(reg.recoveryApproved(id));
        controller.setCircuitBreaker(TOKEN,address(r),500);
        require(controller.policyVersion()==uint256(type(uint64).max)+1&&!reg.recoveryApproved(id));
        vm.expectRevert(Registry.OracleNotApproved.selector);reg.createApprovedOracle(TOKEN,address(agg),keccak256("overflow-denied"));
    }
    function testDApprovalTimestampUpperBoundFailsClosed() public {
        vm.warp(uint256(type(uint64).max)-899);p.set(100e18,block.timestamp);r.set(100e18,block.timestamp);
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setRecoveryApproved(id,true);
    }
    function testDApprovalTimestampAtPackedBoundaryWorksAndExpires() public {
        vm.warp(uint256(type(uint64).max)-900);p.set(100e18,block.timestamp);r.set(100e18,block.timestamp);
        arm();(,,,,uint256 expiry)=reg.recoveryApprovals(id);require(expiry==type(uint64).max);
        vm.warp(uint256(type(uint64).max));require(!reg.recoveryApproved(id));
        vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(id,true);
    }
    function testDConsumedPackedRecordClearsAllPublicFields() public {
        activate();
        (address o,uint256 v,uint256 nonce,uint256 epoch,uint256 expiry)=reg.recoveryApprovals(id);
        require(o==address(0)&&v==0&&nonce==0&&epoch==0&&expiry==0&&!reg.recoveryApproved(id));
    }
}
