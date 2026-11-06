// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesMarketRegistry as Registry} from "../src/LQCFuturesMarketRegistry.sol";
import {LQCPerpEngine as Engine} from "../src/LQCPerpEngine.sol";
import {LQCFuturesVault as Vault} from "../src/LQCFuturesVault.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../src/baseline/LQCAggregatorOracleAdapter.sol";
import {LQCFuturesOracleController as Controller} from "../src/LQCFuturesOracleController.sol";
import {LeafFeed} from "./RegistrySecurity.t.sol";
import {TestCollateral} from "./EngineRegistryIntegration.t.sol";
interface VmFinance {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
}
abstract contract ProtectedFixture {
    VmFinance constant vm=VmFinance(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant A=address(0xA11CE);
    address constant B=address(0xB0B);
    address constant C=address(0xCAFE);
    address constant L=address(0xD00D);
    uint256 constant RAY=1e27;
    int256 constant DELTA=3e24;
    Registry reg;Engine engine;Vault vault;
    TestCollateral t;TestCollateral u;
    LeafFeed p;LeafFeed r;LeafFeed p2;LeafFeed r2;
    Aggregator agg;Aggregator agg2;
    Controller ctrl;Controller ctrl2;
    address oracle;address oracle2;
    function setUp() public virtual {
        vm.warp(1000);reg=new Registry(address(this));t=new TestCollateral();u=new TestCollateral();
        p=new LeafFeed();r=new LeafFeed();p2=new LeafFeed();r2=new LeafFeed();
        p.set(50000e18,1000);r.set(50000e18,1000);p2.set(2000e18,1000);r2.set(2000e18,1000);
        reg.sealOraclePolicy(address(p),address(r),keccak256("local-reviewed-types"));
        agg=new Aggregator(address(this));ctrl=_configure(agg,address(42),p,r);
        oracle=reg.createApprovedOracle(address(42),address(agg),keccak256("local-BTC-observation"));
        agg2=new Aggregator(address(this));ctrl2=_configure(agg2,address(44),p2,r2);
        oracle2=reg.createApprovedOracle(address(44),address(agg2),keccak256("local-ETH-observation"));
        vault=new Vault(address(this));engine=new Engine(address(reg),address(vault));
        vault.setEngine(address(engine));vault.setSupportedCollateral(address(t),true);vault.setSupportedCollateral(address(u),true);
        engine.createFundingLedger(10);engine.enableFundingWithdrawalProtection();
        reg.bindRiskSource(address(engine),address(vault));
        reg.addMarket(bytes32("BTC"),address(42),address(t),oracle,100000,500);
        reg.addMarket(bytes32("ETH"),address(44),address(u),oracle2,100000,500);
        _activate(1);_activate(2);
        _deposit(t,A,5000e18);_deposit(t,B,5000e18);_deposit(t,C,5000e18);
        _deposit(u,A,5000e18);_deposit(u,B,5000e18);_deposit(u,C,5000e18);
    }
    function _configure(Aggregator a,address token,LeafFeed primary,LeafFeed reference_) internal returns(Controller c) {
        c=Controller(reg.createOracleController(address(a)));
        a.transferOwnership(address(c));c.adoptAggregator();c.setFeed(token,address(primary),300);c.setCircuitBreaker(token,address(reference_),500);
    }
    function _activate(uint256 id) internal {
        reg.setMarketMode(id,Registry.MarketMode.REDUCE_ONLY);
        if(!engine.protectedLiquidationCandidate(id))engine.configureProtectedLiquidationCandidate(id,true);
        reg.setRecoveryApproved(id,true);reg.setMarketActive(id,true);
    }
    function _deposit(TestCollateral token,address who,uint256 n) internal {
        token.mint(who,n);vm.prank(who);token.approve(address(vault),type(uint256).max);
        vm.prank(who);vault.deposit(address(token),n);
    }
    function _price(uint256 n) internal {require(n<=uint256(type(int256).max));p.set(int256(n),1000);r.set(int256(n),1000);}
    function _open(address who,uint256 id,bool long_,uint256 margin,uint256 size) internal {
        vm.prank(who);engine.openPosition(id,margin,size,long_);
    }
    function _close(address who,uint256 id) internal {vm.prank(who);engine.closePosition(id);}
    function _reduce(address who,uint256 id,uint256 size) internal {vm.prank(who);engine.reducePosition(id,size);}
    function _settle(address who,uint256 id) internal {vm.prank(who);engine.settleFunding(id);}
    function _withdraw(address who,TestCollateral token,uint256 n) internal {vm.prank(who);vault.withdraw(address(token),n);}
    function _position(address who,uint256 id) internal view returns(bytes32) {
        (uint256 m,uint256 s,uint256 e,bool l,bool o)=engine.positions(who,id);
        return keccak256(abi.encode(m,s,e,l,o,engine.positionFundingEntryRay(who,id)));
    }
    function _collateralSnapshot(TestCollateral token) internal view returns(bytes32 h) {
        address x=address(token);
        h=keccak256(abi.encode(token.balanceOf(address(vault)),vault.totalAccounted(x),vault.fundingPoolBalance(x),vault.insuranceFeeReserve(x),vault.treasuryFeeReserve(x),vault.residualBadDebt(x),vault.totalInsuranceCovered(x)));
        address[3] memory users=[A,B,C];
        for(uint256 i;i<3;i++) h=keccak256(abi.encode(h,token.balanceOf(users[i]),token.allowance(users[i],address(vault)),vault.availableBalance(users[i],x),vault.lockedBalance(users[i],x)));
    }
    function _marketSnapshot(uint256 id) internal view returns(bytes32 h) {
        (int256 index,uint256 bound,bool configured)=engine.fundingStates(id);
        h=keccak256(abi.encode(engine.openInterestUsd(id),index,bound,configured,reg.marketMode(id),reg.policyNonce(id),reg.recoveryApproved(id)));
        h=keccak256(abi.encode(h,_position(A,id),_position(B,id),_position(C,id)));
    }
    function _snapshot() internal view returns(bytes32 h) {
        h=keccak256(abi.encode(_collateralSnapshot(t),_collateralSnapshot(u),ctrl.policyVersion(),ctrl2.policyVersion()));
        for(uint256 id=1;id<=reg.marketCount();id++)h=keccak256(abi.encode(h,_marketSnapshot(id)));
    }
    function _assertBooks(TestCollateral token) internal view {
        address x=address(token);address[3] memory users=[A,B,C];uint256 claims;
        for(uint256 i;i<3;i++){
            uint256 sumMargin;
            for(uint256 id=1;id<=reg.marketCount();id++){
                (,,address collateral,,,,)=reg.markets(id);
                if(collateral==x){(uint256 margin,,,,)=engine.positions(users[i],id);sumMargin+=margin;}
            }
            require(sumMargin==vault.lockedBalance(users[i],x),"position/locked conservation");
            claims+=vault.availableBalance(users[i],x)+vault.lockedBalance(users[i],x);
        }
        require(claims==vault.totalAccounted(x),"accounted=sum claims");
        require(vault.isFullyBacked(x),"segregated liabilities not backed");
        require(token.balanceOf(address(vault))>=claims+vault.fundingPoolBalance(x)+vault.insuranceFeeReserve(x)+vault.treasuryFeeReserve(x),"custody invariant");
        for(uint256 id=1;id<=reg.marketCount();id++){
            uint256 sumSize;for(uint256 i;i<3;i++){(,uint256 size,,,)=engine.positions(users[i],id);sumSize+=size;}
            require(sumSize==engine.openInterestUsd(id),"OI=sum positions");
        }
    }
    function _longAndShortFunding() internal {
        engine.configureFunding(1,1e25);_open(A,1,true,1000e18,5000e18);_open(B,1,false,1000e18,5000e18);
    }
    function _insuredLong(uint256 share,uint256 coverage) internal {
        engine.configureTradingFee(1,1000,share);engine.configureInsuranceCoverage(1,coverage);
        _open(A,1,true,1000e18,5000e18);engine.configureTradingFee(1,0,0);
    }
    function _debtForAdl(bool targetLong) internal {
        _open(A,1,targetLong,1000e18,5000e18);
        _open(B,1,true,1000e18,5000e18);
        _price(35000e18);_close(B,1);
        require(vault.residualBadDebt(address(t))==500e18,"debt fixture");
    }
}

