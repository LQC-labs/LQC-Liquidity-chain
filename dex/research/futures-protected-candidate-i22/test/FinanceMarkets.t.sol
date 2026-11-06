// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault,Registry} from "./FinanceFixture.sol";
contract FinanceMarketsTest is FinanceFixture {

    function testFinanceFactoryRegistryEngineWiring() public view {
        require(reg.oracleFactory().registry()==address(reg));
        require(ctrl.registry()==address(reg)&&ctrl2.registry()==address(reg));
        require(address(engine.registry())==address(reg)&&address(engine.vault())==address(vault)&&vault.engine()==address(engine));
        require(reg.isOracleApproved(oracle,address(42))&&reg.isOracleApproved(oracle2,address(44)));
    }
    function testFinanceDistinctCollateralFundingIsolation() public {
        _longAndShortFunding();_open(A,2,true,1000e18,5000e18);
        bytes32 other=_collateralSnapshot(u);bytes32 m2=_marketSnapshot(2);
        engine.updateFundingIndex(1,DELTA);_settle(A,1);_settle(B,1);
        require(_collateralSnapshot(u)==other&&_marketSnapshot(2)==m2);_assertBooks(t);_assertBooks(u);
    }
    function testFinanceDistinctCollateralFeeAndDebtIsolation() public {
        _open(A,2,true,1000e18,5000e18);bytes32 other=_collateralSnapshot(u);bytes32 m2=_marketSnapshot(2);
        _insuredLong(5000,10000);_price(35000e18);_close(A,1);
        require(vault.residualBadDebt(address(t))==250e18);
        require(_collateralSnapshot(u)==other&&_marketSnapshot(2)==m2);_assertBooks(t);_assertBooks(u);
    }
    function testFinanceOracleFailureIsolatedToItsMarket() public {
        r.setBroken(true);bytes32 other=_collateralSnapshot(t);bytes32 m1=_marketSnapshot(1);
        _open(A,2,true,1000e18,5000e18);
        require(_collateralSnapshot(t)==other&&_marketSnapshot(1)==m1);_assertBooks(t);_assertBooks(u);
    }
    function testFinanceSameCollateralMarketsShareAssetPoolButNotPositionIndices() public {
        uint256 third=reg.addMarket(bytes32("BTC-SECOND"),address(42),address(t),oracle,100000,500);_activate(third);
        engine.configureFunding(1,1e25);engine.configureFunding(third,1e25);
        _open(A,1,true,1000e18,5000e18);_open(A,third,false,500e18,2000e18);
        bytes32 other=_position(A,third);engine.updateFundingIndex(1,DELTA);_settle(A,1);
        require(_position(A,third)==other&&engine.previewFundingPayment(A,third)==0);
        require(vault.lockedBalance(A,address(t))==1500e18);_assertBooks(t);
    }
    function testFinanceSharedCollateralDebtIntentionallyBlocksBothMarkets() public {
        uint256 third=reg.addMarket(bytes32("BTC-SECOND"),address(42),address(t),oracle,100000,500);_activate(third);
        _open(A,1,true,1000e18,5000e18);_price(35000e18);_close(A,1);
        (,,,,,,bool a)=reg.markets(1);(,,,,,,bool b)=reg.markets(third);
        require(!a&&!b&&vault.residualBadDebt(address(t))==500e18);
        (,,,,,,bool separate)=reg.markets(2);require(separate);_assertBooks(t);_assertBooks(u);
    }

}

