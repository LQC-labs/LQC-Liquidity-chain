// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {LQCFuturesM23CollateralDepegGuard as Guard} from "../dex/contracts/futures/LQCFuturesM23CollateralDepegGuard.sol";
import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Oracle} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
interface M23Vm {
    function warp(uint256 t) external;
    function prank(address a) external;
    function expectRevert(bytes4 selector) external;
}
contract LQCFuturesM23CollateralDepegGuardTest {
    M23Vm private constant vm=M23Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant T=2_000_000_000;
    address private constant COL=address(0x666);
    address private constant INDEX=address(0x777);
    address private constant GUARDIAN=address(0xA11);
    address private constant UNAUTHORIZED=address(0xB22);
    Feed private primary;
    Feed private referenceFeed;
    Guard private guard;
    Registry private registry;
    function setUp() public {
        vm.warp(T);
        primary=new Feed(8,1e8);
        referenceFeed=new Feed(8,1e8);
        guard=new Guard(COL,address(primary),address(referenceFeed),95e16,500);
        registry=new Registry(address(this));
        registry.setGuardian(GUARDIAN);
        Oracle marketOracle=new Oracle(address(this));
        Feed btc=new Feed(8,50_000e8);
        marketOracle.setFeed(INDEX,address(btc),300);
        registry.addMarket("BTC/USD",INDEX,COL,address(marketOracle),100_000,500);
        (address feed,uint32 heartbeat,address ref,uint16 deviation)=marketOracle.feedConfigs(INDEX);
        bytes32 cfg=keccak256(abi.encode(INDEX,feed,heartbeat,ref,deviation));
        uint256 version=marketOracle.configVersion(INDEX);
        registry.approveAggregatorRecoveryOracle(1,address(marketOracle),address(marketOracle).codehash,cfg,version);
        registry.setMarketMode(1,Registry.MarketMode.REDUCE_ONLY);
        uint256 epoch=registry.recoveryApprovalEpoch(1);
        registry.approveRecoveryActivation(1,address(marketOracle),address(marketOracle).codehash,
            cfg,version,epoch,T+60);
        registry.activateMarket(1,epoch);
        require(registry.marketMode(1)==Registry.MarketMode.ACTIVE,"M23 market fixture inactive");
    }

    function _haltUsingAuthorizedGuardian() internal {
        bool allowed=guard.admissionAllowed();
        vm.prank(GUARDIAN);
        registry.applyEmergencyTriggers(1,allowed,allowed,false);
    }

    function test_M23_HealthyIndependentMockSourcesAdmit() public {
        require(guard.admissionAllowed(),"M23 fresh par quotes should pass");
        require(guard.collateralPriceUsd18()==1e18,"M23 normalized price wrong");
        _haltUsingAuthorizedGuardian();
        require(registry.marketMode(1)==Registry.MarketMode.ACTIVE,"M23 healthy source changed mode");
    }
    function test_M23_DepegDeniesAndAuthorizedGuardianCanHalt() public {
        primary.setAnswer(90_000_000);
        referenceFeed.setAnswer(90_000_000);
        require(!guard.admissionAllowed(),"M23 90-cent depeg not blocked");
        require(registry.marketMode(1)==Registry.MarketMode.ACTIVE,
            "M23 read-only guard should not impersonate guardian");
        _haltUsingAuthorizedGuardian();
        require(registry.marketMode(1)==Registry.MarketMode.HALTED,
            "M23 explicit authorized response did not halt");
    }
    function test_M23_StalePrimaryAndFutureReferenceDeny() public {
        primary.setUpdatedAt(T-121);
        require(!guard.admissionAllowed(),"M23 stale source accepted");
        primary.setUpdatedAt(T);
        referenceFeed.setUpdatedAt(T+1);
        require(!guard.admissionAllowed(),"M23 future source accepted");
    }
    function test_M23_DivergentSourcesDeny() public {
        primary.setAnswer(99_000_000);
        referenceFeed.setAnswer(105_000_000);
        require(!guard.admissionAllowed(),"M23 divergent primary/reference accepted");
    }
    function test_M23_InvalidRoundsOrZeroQuotesDeny() public {
        primary.setAnswer(0);
        require(!guard.admissionAllowed(),"M23 zero price accepted");
        primary.setAnswer(-1);
        require(!guard.admissionAllowed(),"M23 negative price accepted");
    }
    function test_M23_UnauthorizedAccountCannotHaltOrReactivate() public {
        primary.setAnswer(90_000_000);
        referenceFeed.setAnswer(90_000_000);
        vm.expectRevert(Registry.Forbidden.selector);
        vm.prank(UNAUTHORIZED);
        registry.applyEmergencyTriggers(1,false,false,false);
        require(registry.marketMode(1)==Registry.MarketMode.ACTIVE,
            "M23 unauthorized call changed Registry");
        _haltUsingAuthorizedGuardian();
        vm.expectRevert(Registry.Forbidden.selector);
        vm.prank(GUARDIAN);
        registry.setEmergencyMarketMode(1,Registry.MarketMode.ACTIVE);
        require(registry.marketMode(1)==Registry.MarketMode.HALTED,
            "M23 guardian reactivated halted market");
    }
    function testFuzz_M23_DownsidePegThreshold(uint32 cents) public {
        uint256 price=uint256(cents)%1_000_000_001;
        if(price==0)price=1;
        // Restrict to 0..1 USD in 8 decimals for this test.
        uint256 cents8=price%100_000_001;
        if(cents8==0)cents8=1;
        primary.setAnswer(int256(cents8));
        referenceFeed.setAnswer(int256(cents8));
        bool expected=cents8>=95_000_000;
        require(guard.admissionAllowed()==expected,"M23 peg floor inconsistent");
    }
}
