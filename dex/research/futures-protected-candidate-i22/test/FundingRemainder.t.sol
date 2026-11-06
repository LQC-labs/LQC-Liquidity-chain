// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault} from './FinanceFixture.sol';
interface VmRemainder {function recordLogs() external;struct Log{bytes32[] topics;bytes data;address emitter;}function getRecordedLogs() external returns(Log[] memory);function etch(address,bytes calldata) external;function mockCallRevert(address,bytes calldata,bytes calldata) external;function clearMockedCalls() external;}
contract FundingRemainderTest is FinanceFixture {
    VmRemainder constant vr=VmRemainder(address(uint160(uint256(keccak256('hevm cheat code')))));
    int256 constant HALF=5e26;
    function rem(address a) internal view returns(int256){return engine.fundingRemainderRay(a,1,address(t));}
    function both() internal {int256 due=engine.previewFundingPayment(A,1);if(due<0){_settle(A,1);_settle(B,1);}else{_settle(B,1);_settle(A,1);}}
    function fullSnapshot() internal view returns(bytes32 h){h=_snapshot();address[3] memory users=[A,B,C];for(uint256 id=1;id<=reg.marketCount();id++){(,,address token,,,,)=reg.markets(id);for(uint256 k;k<3;k++)h=keccak256(abi.encode(h,engine.fundingRemainderRay(users[k],id,token)));}}
    function testRHalfTwentyReceiverAndPayerExact() public {
        _longAndShortFunding();for(uint256 k;k<20;k++){engine.updateFundingIndex(1,100000);both();}
        require(vault.availableBalance(A,address(t))==4000e18-10&&vault.availableBalance(B,address(t))==4000e18+10);require(rem(A)==0&&rem(B)==0&&vault.fundingPoolBalance(address(t))==0);_assertBooks(t);
    }
    function testRNonzeroPaymentKeepsFractionAndNextCombines() public {
        _longAndShortFunding();engine.updateFundingIndex(1,300000);both();require(rem(A)==-HALF&&rem(B)==HALF);
        require(vault.availableBalance(A,address(t))==4000e18-1);engine.updateFundingIndex(1,100000);both();require(rem(A)==0&&rem(B)==0&&vault.availableBalance(A,address(t))==4000e18-2);_assertBooks(t);
    }
    function testRSignReversalNormalizesWholeAndOppositeFraction() public {
        _longAndShortFunding();engine.updateFundingIndex(1,100000);both();require(rem(A)==-HALF);engine.updateFundingIndex(1,-300000);both();require(rem(A)==0&&rem(B)==0&&vault.availableBalance(A,address(t))==4000e18+1);_assertBooks(t);
    }
    function testRSignCrossCanonicalPositiveWholeNegativeRemainder() public {
        _longAndShortFunding();engine.updateFundingIndex(1,100000);both();engine.updateFundingIndex(1,-200001);both();
        require(engine.previewFundingPayment(A,1)==0&&rem(A)==500005000000000000000000000);require(rem(B)==-rem(A));_assertBooks(t);
    }
    function testRFullCloseReopenOppositePreservesOldDebt() public {
        _longAndShortFunding();engine.updateFundingIndex(1,100000);_close(A,1);require(rem(A)==-HALF);
        _open(A,1,false,1000e18,5000e18);require(rem(A)==-HALF&&engine.previewFundingPayment(A,1)==0);engine.updateFundingIndex(1,-100000);_settle(A,1);require(rem(A)==0&&vault.fundingPoolBalance(address(t))==1);_assertBooks(t);
    }
    function testRPartialAndFullAdlKeepFraction() public {
        _debtForAdl(false);engine.configureFunding(1,1e25);engine.updateFundingIndex(1,-100000);engine.configureAdlSafety(1,true,10000);
        engine.executeAdl(A,1,1250e18);require(rem(A)==-HALF);engine.executeAdl(A,1,3750e18);require(rem(A)==-HALF);(,,,,bool open)=engine.positions(A,1);require(!open);_assertBooks(t);
    }
    function testRPartialAndFullLiquidationKeepFraction() public {
        _longAndShortFunding();engine.updateFundingIndex(1,100000);engine.configurePartialLiquidation(1,2500,0);_price(42500e18);vm.prank(L);engine.liquidate(A,1);require(rem(A)==-HALF);
        engine.configurePartialLiquidation(1,10000,0);_price(30000e18);vm.prank(L);engine.liquidate(A,1);require(rem(A)==-HALF);(,,,,bool open)=engine.positions(A,1);require(!open);_assertBooks(t);
    }
    function testRFailedReceiverSettlementRollsBackRemainderAndCheckpoint() public {
        _longAndShortFunding();engine.updateFundingIndex(1,100000);_settle(B,1);require(rem(B)==HALF);engine.updateFundingIndex(1,300000);bytes32 snap=fullSnapshot();vm.prank(B);vm.expectRevert(Vault.InsufficientFundingPool.selector);engine.settleFunding(1);require(fullSnapshot()==snap);_assertBooks(t);
    }
    function testRLiquidationBreakdownMatchesActualCollectionsInsuranceAndResidual() public {
        engine.configureFunding(1,RAY);_insuredLong(10000,5000);_withdraw(A,t,3500e18);engine.updateFundingIndex(1,4e26+100000);vr.recordLogs();vm.prank(L);engine.liquidate(A,1);
        VmRemainder.Log[] memory logs=vr.getRecordedLogs();bool found;
        for(uint256 k;k<logs.length;k++)if(logs[k].emitter==address(engine)&&logs[k].topics[0]==keccak256('FundingLiquidationBreakdown(address,uint256,uint256,uint256,uint256,uint256,uint256,int256)')){
            (uint256 credit,uint256 locked,uint256 available,uint256 insurance,uint256 debt,int256 fraction)=abi.decode(logs[k].data,(uint256,uint256,uint256,uint256,uint256,int256));
            require(credit==0&&locked==1000e18&&available==0&&insurance==500e18&&debt==500e18&&fraction==-HALF);found=true;
        }
        require(found&&rem(A)==-HALF&&vault.fundingPoolBalance(address(t))==1500e18&&vault.totalInsuranceCovered(address(t))==500e18&&vault.residualBadDebt(address(t))==500e18);_assertBooks(t);
    }
    function testFuzzRSignedModelConservation(uint256 seed,uint8 n) public {
        _longAndShortFunding();int256 carry;int256 accrued;int256 cash;uint256 steps=1+uint256(n)%16;
        for(uint256 k;k<steps;k++){
            seed=uint256(keccak256(abi.encode(seed,k)));int256 delta=int256(1+seed%1000000);if(seed&1==0)delta=-delta;
            engine.updateFundingIndex(1,delta);int256 added=-int256(5000e18)*delta;accrued+=added;int256 combined=carry+added;int256 q=combined/int256(RAY);carry=combined%int256(RAY);
            require(engine.previewFundingPayment(A,1)==q&&engine.previewFundingPayment(B,1)==-q);both();cash+=q;
            require(rem(A)==carry&&rem(B)==-carry&&accrued==cash*int256(RAY)+carry);require(int256(vault.availableBalance(A,address(t)))-int256(4000e18)==cash);_assertBooks(t);
        }
    }
    function testRPostAdlFailureRestoresChangedFractionAndCheckpoint() public {
        _debtForAdl(false);engine.configureFunding(1,1e25);engine.updateFundingIndex(1,-100000);_settle(A,1);require(rem(A)==-HALF);engine.updateFundingIndex(1,-50000);engine.configureAdlSafety(1,true,2500);
        bytes32 snap=fullSnapshot();vr.mockCallRevert(address(vault),abi.encodeWithSelector(Vault.absorbAdlBadDebt.selector),abi.encodeWithSignature('Error(string)','after remainder commit'));vm.expectRevert();engine.executeAdl(A,1,1250e18);vr.clearMockedCalls();require(fullSnapshot()==snap&&rem(A)==-HALF);_assertBooks(t);
    }
    function testRProductOverflowFailsWithoutConsumingCarry() public {
        _deposit(t,C,1e60);_open(C,1,true,1e60,1e61);engine.configureFunding(1,RAY);engine.updateFundingIndex(1,int256(RAY));bytes32 snap=fullSnapshot();vm.prank(C);vm.expectRevert(Engine.FundingOverflow.selector);engine.settleFunding(1);require(fullSnapshot()==snap);_assertBooks(t);
    }
    function testRRemainderIsolatedAcrossMarketAndCollateral() public {
        uint256 third=reg.addMarket(bytes32('third'),address(42),address(t),oracle,100000,500);_activate(third);
        _open(A,1,true,1000e18,5000e18);_open(A,third,true,1000e18,5000e18);_open(A,2,true,1000e18,5000e18);engine.configureFunding(1,1e25);engine.updateFundingIndex(1,100000);_settle(A,1);
        require(rem(A)==-HALF&&engine.fundingRemainderRay(A,third,address(t))==0&&engine.fundingRemainderRay(A,2,address(u))==0&&engine.fundingRemainderRay(A,1,address(u))==0);_assertBooks(t);_assertBooks(u);
    }
    function testRLiquidationBreakdownIncludesActualAvailableDebit() public {
        engine.configureFunding(1,RAY);_insuredLong(10000,10000);_withdraw(A,t,2500e18);engine.updateFundingIndex(1,4e26+100000);vr.recordLogs();vm.prank(L);engine.liquidate(A,1);
        VmRemainder.Log[] memory logs=vr.getRecordedLogs();bool found;
        for(uint256 k;k<logs.length;k++)if(logs[k].emitter==address(engine)&&logs[k].topics[0]==keccak256('FundingLiquidationBreakdown(address,uint256,uint256,uint256,uint256,uint256,uint256,int256)')){
            (uint256 credit,uint256 locked,uint256 available,uint256 insurance,uint256 debt,int256 fraction)=abi.decode(logs[k].data,(uint256,uint256,uint256,uint256,uint256,int256));require(credit==0&&locked==1000e18&&available==1000e18&&insurance==0&&debt==0&&fraction==-HALF);found=true;
        }
        require(found&&vault.availableBalance(A,address(t))==0&&vault.fundingPoolBalance(address(t))==2000e18&&vault.insuranceFeeReserve(address(t))==500e18&&vault.residualBadDebt(address(t))==0);_assertBooks(t);
    }
}
