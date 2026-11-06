// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FundingLedger} from '../src/funding/FundingLedger.sol';
import {LedgerMath} from '../src/funding/LedgerMath.sol';
import {LedgerWideVectors} from './LedgerWideVectors.sol';
interface VmLedger {function roll(uint256) external;function prank(address) external;function expectRevert() external;function expectRevert(bytes4) external;function etch(address,bytes calldata) external;}
contract LedgerTestToken {mapping(address=>uint256)public balanceOf;function mint(address a,uint256 n) external {balanceOf[a]+=n;}}
contract LedgerTestVault {
    address public immutable owner;address public immutable engine;address public adapter;
    mapping(address=>mapping(address=>uint256))public availableBalance;mapping(address=>mapping(address=>uint256))public lockedBalance;
    mapping(address=>uint256)public totalAccounted;mapping(address=>uint256)public fundingPoolBalance;mapping(address=>uint256)public insuranceFeeReserve;mapping(address=>uint256)public treasuryFeeReserve;
    constructor(address e){owner=msg.sender;engine=e;}
    modifier onlyOwner(){require(msg.sender==owner);_;}modifier onlyAdapter(){require(msg.sender==adapter);_;}
    function bind(address a) external onlyOwner {require(adapter==address(0));adapter=a;}
    function seedUser(address t,address a,uint256 n) external onlyOwner {LedgerTestToken(t).mint(address(this),n);availableBalance[a][t]+=n;totalAccounted[t]+=n;}
    function seedPool(address t,uint256 n) external onlyOwner {LedgerTestToken(t).mint(address(this),n);fundingPoolBalance[t]+=n;}
    function seedInsurance(address t,uint256 n) external onlyOwner {LedgerTestToken(t).mint(address(this),n);insuranceFeeReserve[t]+=n;}
    function seedTreasury(address t,uint256 n) external onlyOwner {LedgerTestToken(t).mint(address(this),n);treasuryFeeReserve[t]+=n;}
    function collect(address a,address t,uint256 n) external onlyAdapter {availableBalance[a][t]-=n;totalAccounted[t]-=n;fundingPoolBalance[t]+=n;}
    function pay(address a,address t,uint256 n) external onlyAdapter {fundingPoolBalance[t]-=n;availableBalance[a][t]+=n;totalAccounted[t]+=n;}
    function corruptInsurance(address t) external onlyAdapter {insuranceFeeReserve[t]=0;}
    function corruptPool(address t,uint256 n) external onlyOwner {fundingPoolBalance[t]=n;}
}
contract LedgerTestEngine {
    address public immutable owner;address public fundingLedger;
    mapping(bytes32=>mapping(uint256=>int256))private amounts;mapping(bytes32=>mapping(uint256=>bool))private ready;
    constructor(){owner=msg.sender;}modifier onlyOwner(){require(msg.sender==owner);_;}
    function bind(address l) external onlyOwner {require(fundingLedger==address(0));fundingLedger=l;}
    function publish(address a,uint256 m,address t,uint256 n,int256 q) external onlyOwner {bytes32 k=keccak256(abi.encode(a,m,t));require(!ready[k][n]);amounts[k][n]=q;ready[k][n]=true;}
    function fundingCheckpoint(address a,uint256 m,address t,uint256 n) external view returns(int256,bool){bytes32 k=keccak256(abi.encode(a,m,t));return(amounts[k][n],ready[k][n]);}
    function book(address a,uint256 m,address t,uint256 n) external onlyOwner returns(uint256){return FundingLedger(fundingLedger).crystallize(a,m,t,n);}
    function collect(address a,uint256 m,address t,uint256 n) external onlyOwner {FundingLedger(fundingLedger).collect(a,m,t,n);}
}
contract LedgerTestAdapter {
    address public immutable owner;address public immutable engine;address public immutable vault;address public fundingLedger;
    uint256 public mode;uint256 public attackId;uint256 public attackAmount;bool public reentryBlocked;
    constructor(address e,address v){owner=msg.sender;engine=e;vault=v;}
    modifier onlyLedger(){require(msg.sender==fundingLedger);_;}
    function bind(address l) external {require(msg.sender==owner&&fundingLedger==address(0));fundingLedger=l;}
    function configure(uint256 m,uint256 id,uint256 amount) external {require(msg.sender==owner);mode=m;attackId=id;attackAmount=amount;}
    function collect(address a,uint256,address t,uint256 n) external onlyLedger {if(mode==1)return;LedgerTestVault(vault).collect(a,t,n);if(mode==3)LedgerTestVault(vault).corruptInsurance(t);}
    function pay(address a,address t,uint256 n) external onlyLedger {
        if(mode==1)return;
        if(mode==2||mode==4){(bool ok,)=fundingLedger.call(abi.encodeWithSelector(FundingLedger.claim.selector,attackId,attackAmount));reentryBlocked=!ok;if(mode==4)require(ok,'propagated callback failure');}
        LedgerTestVault(vault).pay(a,t,n);if(mode==3)LedgerTestVault(vault).corruptInsurance(t);
    }
}
contract FundingLedgerTest {
    VmLedger constant vm=VmLedger(address(uint160(uint256(keccak256('hevm cheat code')))));
    address constant A=address(0xA11CE);address constant B=address(0xB0B);address constant P=address(0xCAFE);
    FundingLedger l;LedgerTestEngine e;LedgerTestVault v;LedgerTestAdapter a;LedgerTestToken t;LedgerTestToken u;
    function setUp() public {vm.roll(100);e=new LedgerTestEngine();v=new LedgerTestVault(address(e));a=new LedgerTestAdapter(address(e),address(v));t=new LedgerTestToken();u=new LedgerTestToken();l=new FundingLedger(address(e),address(v),address(a),address(e).codehash,address(v).codehash,address(a).codehash,10);e.bind(address(l));a.bind(address(l));v.bind(address(a));v.seedUser(address(t),P,1000);}
    function book(address who,uint256 m,int256 q) internal returns(uint256){return bookToken(who,m,address(t),q);}
    function bookToken(address who,uint256 m,address token,int256 q) internal returns(uint256){uint256 n=l.lastNonce(l.key(who,m,token))+1;e.publish(who,m,token,n,q);return e.book(who,m,token,n);}
    function mature() internal {vm.roll(110);l.seal(address(t),10);}
    function allocate(uint256 budget) internal {v.seedPool(address(t),budget);mature();l.startRound(address(t),10);l.allocate(address(t),10,32);}
    function reserved(uint256 id) internal view returns(uint256 r){(,,,,,,r)=l.claims(id);}
    function remaining(uint256 id) internal view returns(uint256 r){(,,,,,r,)=l.claims(id);}
    function testBookRightsAreNotCashAndNoAutomaticNetting() public {book(A,1,20);book(A,1,-7);require(l.receivable(l.key(A,1,address(t)))==20&&l.payableAmount(l.key(A,1,address(t)))==7);require(v.availableBalance(A,address(t))==0&&v.fundingPoolBalance(address(t))==0);}
    function testDuplicateCheckpointRejected() public {book(A,1,20);vm.expectRevert(FundingLedger.DuplicateCheckpoint.selector);e.book(A,1,address(t),1);require(l.totalReceivable(address(t))==20);}
    function testMissingProofAndSkippedNonceRejected() public {vm.expectRevert(FundingLedger.InvalidCheckpoint.selector);e.book(A,1,address(t),1);vm.expectRevert(FundingLedger.DuplicateCheckpoint.selector);e.book(A,1,address(t),2);require(l.lastNonce(l.key(A,1,address(t)))==0);}
    function testZeroProofAdvancesOnceWithoutClaim() public {book(A,1,0);require(l.lastNonce(l.key(A,1,address(t)))==1&&l.claimCount()==0);}
    function testOnlyPinnedEngineCanBookOrCollect() public {vm.prank(B);vm.expectRevert(FundingLedger.Forbidden.selector);l.crystallize(A,1,address(t),1);vm.prank(B);vm.expectRevert(FundingLedger.Forbidden.selector);l.collect(P,1,address(t),1);}
    function testCollectionMovesActualAssetsAndReducesDebtExactly() public {book(P,1,-90);e.collect(P,1,address(t),40);require(l.payableAmount(l.key(P,1,address(t)))==50&&l.totalPayable(address(t))==50);require(v.availableBalance(P,address(t))==960&&v.fundingPoolBalance(address(t))==40&&v.totalAccounted(address(t))==960);}
    function testNoopCollectionRollsBackPayable() public {book(P,1,-90);a.configure(1,0,0);vm.expectRevert(FundingLedger.CashMismatch.selector);e.collect(P,1,address(t),40);require(l.totalPayable(address(t))==90&&v.availableBalance(P,address(t))==1000);}
    function testOvercollectionRejectedAndNoDebtDeletion() public {book(P,1,-9);vm.expectRevert(FundingLedger.InvalidInput.selector);e.collect(P,1,address(t),10);require(l.totalPayable(address(t))==9);}
    function testEpochProRataPartialPaymentAndRemainderPreserved() public {uint256 x=book(A,1,100);uint256 y=book(B,1,300);allocate(200);require(reserved(x)==50&&reserved(y)==150&&l.totalReceivable(address(t))==400);l.claim(x,50);l.claim(y,150);require(remaining(x)==50&&remaining(y)==150&&l.totalReceivable(address(t))==200&&v.fundingPoolBalance(address(t))==0);}
    function testClaimOrderCannotDrainAnotherUsersAllocation() public {uint256 x=book(A,1,100);uint256 y=book(B,1,300);allocate(200);vm.prank(P);l.claim(y,150);require(reserved(x)==50);l.claim(x,50);require(v.availableBalance(A,address(t))==50&&v.availableBalance(B,address(t))==150);}
    function testOverclaimAndDuplicateClaimRejected() public {uint256 x=book(A,1,10);allocate(10);vm.expectRevert(FundingLedger.InvalidInput.selector);l.claim(x,11);l.claim(x,10);vm.expectRevert(FundingLedger.InvalidInput.selector);l.claim(x,1);require(l.totalReceivable(address(t))==0);}
    function testSecondRoundDoesNotAllocateUnclaimedReservedTwice() public {uint256 x=book(A,1,100);uint256 y=book(B,1,100);allocate(100);require(reserved(x)==50&&reserved(y)==50);v.seedPool(address(t),100);l.startRound(address(t),10);l.allocate(address(t),10,32);require(reserved(x)==100&&reserved(y)==100&&l.reservedCash(address(t))==200);l.claim(x,100);l.claim(y,100);require(l.totalReceivable(address(t))==0&&l.reservedCash(address(t))==0);}
    function testInsuranceAndTreasuryNeverUsedOrChanged() public {v.seedInsurance(address(t),20);v.seedTreasury(address(t),30);uint256 x=book(A,1,10);mature();vm.expectRevert(FundingLedger.Underfunded.selector);l.startRound(address(t),10);require(v.insuranceFeeReserve(address(t))==20&&v.treasuryFeeReserve(address(t))==30&&remaining(x)==10);}
    function testInsuranceMutationDuringCashPaymentRevertsEverything() public {v.seedInsurance(address(t),20);uint256 x=book(A,1,10);allocate(10);a.configure(3,0,0);vm.expectRevert(FundingLedger.CashMismatch.selector);l.claim(x,10);require(remaining(x)==10&&reserved(x)==10&&v.insuranceFeeReserve(address(t))==20&&v.availableBalance(A,address(t))==0);}
    function testNoopPayoutCannotMarkPaid() public {uint256 x=book(A,1,10);allocate(10);a.configure(1,0,0);vm.expectRevert(FundingLedger.CashMismatch.selector);l.claim(x,10);require(remaining(x)==10&&reserved(x)==10&&l.totalReceivable(address(t))==10);}
    function testCallbackReentrancyBlockedWithoutDoublePayment() public {uint256 x=book(A,1,10);allocate(10);a.configure(2,x,10);l.claim(x,10);require(a.reentryBlocked()&&v.availableBalance(A,address(t))==10&&l.totalReceivable(address(t))==0);}
    function testPropagatedCallbackFailureRollsBackClaim() public {uint256 x=book(A,1,10);allocate(10);a.configure(4,x,10);vm.expectRevert();l.claim(x,10);require(remaining(x)==10&&reserved(x)==10&&v.availableBalance(A,address(t))==0);}
    function testSealedMembershipAndFaceCannotBeChangedByLateBooking() public {book(A,1,10);mature();book(A,1,20);(uint256 face,,,,,,,,,uint256 count)=l.epochState(address(t),10);require(face==10&&count==1&&l.queueLength(address(t))==2);}
    function testSameDomainSameEpochAggregatesClaim() public {uint256 x=book(A,1,10);uint256 y=book(A,1,20);require(x==y&&l.claimCount()==1&&remaining(x)==30);}
    function testMaturityRequiredAndBatchBoundEnforced() public {book(A,1,10);vm.expectRevert(FundingLedger.InvalidEpoch.selector);l.seal(address(t),10);v.seedPool(address(t),10);mature();l.startRound(address(t),10);vm.expectRevert(FundingLedger.BatchLimit.selector);l.allocate(address(t),10,33);vm.expectRevert(FundingLedger.BatchLimit.selector);l.advance(address(t),0);}
    function testCursorProcessesOneClaimPerBoundedCall() public {uint256 x=book(A,1,100);uint256 y=book(B,1,100);v.seedPool(address(t),100);mature();l.startRound(address(t),10);l.allocate(address(t),10,1);require(reserved(x)==50&&reserved(y)==0&&l.reservedCash(address(t))==100);l.claim(x,50);l.allocate(address(t),10,1);require(reserved(y)==50&&l.reservedCash(address(t))==50);}
    function testDustStaysCashAndUnpaidRightsRemain() public {uint256 x=book(A,1,1);uint256 y=book(B,1,1);allocate(1);require(reserved(x)==0&&reserved(y)==0&&remaining(x)==1&&remaining(y)==1&&l.reservedCash(address(t))==0&&v.fundingPoolBalance(address(t))==1);vm.expectRevert(FundingLedger.Underfunded.selector);l.startRound(address(t),10);v.seedPool(address(t),1);l.startRound(address(t),10);l.allocate(address(t),10,32);require(reserved(x)==1&&reserved(y)==1);}
    function testOldUnfundedEpochCannotBeSkippedButFundedUnclaimedCan() public {uint256 x=book(A,1,10);mature();book(B,1,10);vm.roll(120);l.seal(address(t),11);v.seedPool(address(t),20);vm.expectRevert(FundingLedger.InvalidRound.selector);l.startRound(address(t),11);l.startRound(address(t),10);l.allocate(address(t),10,32);l.advance(address(t),1);l.startRound(address(t),11);l.allocate(address(t),11,32);require(reserved(x)==10&&l.reservedCash(address(t))==20);}
    function testMarketAndCollateralObligationsAreDistinct() public {book(A,1,10);book(A,2,20);bookToken(A,1,address(u),30);require(l.receivable(l.key(A,1,address(t)))==10&&l.receivable(l.key(A,2,address(t)))==20&&l.receivable(l.key(A,1,address(u)))==30);}
    function testUnbackedPoolCannotBeReserved() public {book(A,1,10);v.corruptPool(address(t),2000);mature();vm.expectRevert(FundingLedger.Underfunded.selector);l.startRound(address(t),10);require(l.reservedCash(address(t))==0);}
    function testRuntimeMutationFailsClosed() public {book(A,1,10);vm.etch(address(e),hex'00');vm.expectRevert(FundingLedger.IntegrationMismatch.selector);l.seal(address(t),10);require(l.totalReceivable(address(t))==10);}
    function testConstructorRejectsWrongPins() public {vm.expectRevert(FundingLedger.InvalidInput.selector);new FundingLedger(address(e),address(v),address(a),bytes32(0),address(v).codehash,address(a).codehash,10);}
    function testSignedMinAndPayableOverflowRevertWithoutNonceConsumption() public {e.publish(P,1,address(t),1,type(int256).min);vm.expectRevert(FundingLedger.InvalidCheckpoint.selector);e.book(P,1,address(t),1);require(l.lastNonce(l.key(P,1,address(t)))==0);book(P,2,-type(int256).max);book(P,2,-type(int256).max);e.publish(P,2,address(t),3,-3);vm.expectRevert();e.book(P,2,address(t),3);require(l.lastNonce(l.key(P,2,address(t)))==2);}
    function testLargeOverflowingProductUsesExactBoundedDivision() public {uint256 m=uint256(type(int256).max);uint256 x=book(A,1,int256(m));uint256 y=book(B,1,int256(m));allocate(m);require(reserved(x)==m/2&&reserved(y)==m/2&&l.reservedCash(address(t))==m-1);}
    function testFuzzExactAllocationAgainstSafeProduct(uint128 aa,uint128 bb,uint128 cash) public {uint256 x=1+uint256(aa);uint256 y=1+uint256(bb);uint256 sum=x+y;uint256 budget=uint256(cash)%sum;require(LedgerMath.proportion(budget,x,sum)==budget*x/sum&&LedgerMath.proportion(budget,y,sum)==budget*y/sum);}
    function testFuzzPartialAllocationNeverExceedsCashOrRights(uint64 rawA,uint64 rawB,uint64 rawCash) public {uint256 x=1+uint256(rawA);uint256 y=1+uint256(rawB);uint256 budget=1+uint256(rawCash)%(x+y);uint256 idA=book(A,1,int256(x));uint256 idB=book(B,1,int256(y));allocate(budget);uint256 ra=reserved(idA);uint256 rb=reserved(idB);require(ra<=x&&rb<=y&&ra+rb<=budget&&l.reservedCash(address(t))==ra+rb&&l.totalReceivable(address(t))==x+y);}
    function testCashBackingRecheckedAtEveryAllocationBatch() public {book(A,1,100);v.seedPool(address(t),100);mature();l.startRound(address(t),10);v.corruptPool(address(t),50);vm.expectRevert(FundingLedger.Underfunded.selector);l.allocate(address(t),10,32);require(reserved(1)==0&&l.totalReceivable(address(t))==100);}
    function testRegistrationOrderDoesNotChangeProportionalAmounts() public {uint256 x=book(A,1,100);uint256 y=book(B,1,300);allocate(200);require(reserved(x)==50&&reserved(y)==150);uint256 nextB=book(B,1,300);uint256 nextA=book(A,1,100);v.seedPool(address(t),200);l.startRound(address(t),10);l.allocate(address(t),10,32);l.advance(address(t),1);vm.roll(120);l.seal(address(t),11);v.seedPool(address(t),200);l.startRound(address(t),11);l.allocate(address(t),11,32);require(reserved(nextB)==150&&reserved(nextA)==50&&l.reservedCash(address(t))==600);}
    function testCashCannotCrossCollateralDomains() public {uint256 x=book(A,1,10);bookToken(A,1,address(u),30);allocate(10);l.claim(x,10);require(l.totalReceivable(address(t))==0&&l.totalReceivable(address(u))==30&&v.availableBalance(A,address(u))==0&&v.fundingPoolBalance(address(u))==0);}
    function testWideAllocationAgainstIndependentBigIntVectors() public pure {LedgerWideVectors.check();}
    function testMaximumBatchWithOverflowingProductsIsBounded() public {uint256 weight=type(uint256).max/32;for(uint256 k;k<32;k++)book(address(uint160(0x1000+k)),1,int256(weight));uint256 budget=weight*32/2;allocate(budget);require(reserved(32)>0&&l.reservedCash(address(t))<=budget&&l.totalReceivable(address(t))==weight*32);}
    function testFuzzActualCollectionPartialAndFinalPayoutConservesAll(uint16 aa,uint16 bb,uint16 cc) public {
        uint256 x=1+uint256(aa)%400;uint256 y=1+uint256(bb)%400;uint256 total=x+y;uint256 first=1+uint256(cc)%total;uint256 idA=book(A,1,int256(x));uint256 idB=book(B,1,int256(y));book(P,1,-int256(total));e.collect(P,1,address(t),first);mature();l.startRound(address(t),10);l.allocate(address(t),10,32);
        uint256 ra=reserved(idA);uint256 rb=reserved(idB);if(ra!=0)l.claim(idA,ra);if(rb!=0)l.claim(idB,rb);
        require(l.totalReceivable(address(t))==total-ra-rb&&l.totalPayable(address(t))==total-first);if(first<total)e.collect(P,1,address(t),total-first);
        if(l.totalReceivable(address(t))!=0){l.startRound(address(t),10);l.allocate(address(t),10,32);ra=reserved(idA);rb=reserved(idB);if(ra!=0)l.claim(idA,ra);if(rb!=0)l.claim(idB,rb);}
        require(l.totalReceivable(address(t))==0&&l.totalPayable(address(t))==0&&l.reservedCash(address(t))==0&&v.fundingPoolBalance(address(t))==0);require(v.availableBalance(A,address(t))==x&&v.availableBalance(B,address(t))==y&&v.availableBalance(P,address(t))==1000-total&&v.totalAccounted(address(t))==1000);
    }
}
