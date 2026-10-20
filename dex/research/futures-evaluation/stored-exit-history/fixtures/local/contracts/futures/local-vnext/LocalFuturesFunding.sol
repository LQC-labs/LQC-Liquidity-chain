// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ILocalDomainRegistry} from "./LocalFuturesCore.sol";
import {LocalFuturesExposureLedger} from "./LocalFuturesExposureLedger.sol";
import {LocalFuturesFundingStudyCalculation as Calculation} from "./LocalFuturesFundingStudyCalculation.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface ILocalFundingCore {
 function domainRegistry() external view returns(address);
 function localPartial() external view returns(address);
 function governance() external view returns(address);
 function fundingStudyDomain(uint256 id) external view returns(address token,address governor,uint8 decimals_);
 function observe(uint256 id) external view returns(uint256,uint256,uint256,uint256);
}

interface ICoreExposureContext {
 function exposureBindings(uint256) external view returns(uint256,bytes32,uint256,uint256);
 function coreExposureContext(uint256) external view returns(address,uint256[5] memory,bytes32);
}
interface IPartialClosure {function partialClosure(uint256,address,uint256,uint256,uint256) external view returns(bool);}

interface IRepeatCollectionQuote {
 struct Quote {bytes32 positionKey;bytes32 accountKey;bytes32 epochKey;address owner;uint256 domain;uint256 accountLimit;uint256 positionLimit;uint256 budget;uint256 pnl;uint256 funding;uint256 fee;}
 function core() external view returns(address);
 function funding() external view returns(address);
 function partialSettlement() external view returns(address);
 function collectionQuote(uint256,bytes32) external view returns(Quote memory);
}

interface ICollectionExecution {
 function contextHash() external view returns(bytes32);
 function fundingAuthorization() external view returns(bytes32);
 function partialAuthorization() external view returns(bytes32);
}
interface IRepeatPayoutExecutor {
 struct Quote {bytes32 rightsKey;bytes32 epochKey;uint256 limit;uint256 claim;uint256 denominator;uint256 collected;}
 function core() external view returns(address);
 function funding() external view returns(address);
 function partialSettlement() external view returns(address);
 function coordinator() external view returns(address);
 function payoutSpecification() external view returns(address);
 function validateBinding(address,address,address) external view returns(address);
 function payoutQuote(uint256,address,bytes32) external view returns(Quote memory);
 function authorizePayout(uint256,address,bytes32) external view returns(bytes32,bytes32,uint256);
 function validateReceipt(uint256,address,bytes32,uint256,uint256,bytes32,uint256) external view returns(bytes32,uint256);
}
interface IFundingToken {
 function balanceOf(address) external view returns(uint256);
 function transfer(address,uint256) external returns(bool);
 function transferFrom(address,address,uint256) external returns(bool);
}
/// @notice LOCAL chain 31337 study only. Not connected to positions, Vault or production.
interface ILocalFuturesFundingOperationRegistry {function assertOperation(uint256,bytes4) external view;function assertFundingPolicy(uint256,bytes32) external view;}
contract LocalFuturesFunding {
 ILocalFundingCore public immutable core;
 Calculation private immutable studyCalculation;
 struct Domain {address token;address governor;uint8 decimals_;}
 uint256 private entered;
 mapping(bytes32=>bool) public researchSettled;
 error Forbidden();error Invalid();error WrongState();error PolicyBlocked();error Insufficient();error TransferFailed();error Reentrant();error Duplicate();
 modifier lock(){if(entered!=0)revert Reentrant();entered=1;_;entered=0;}
 constructor(address core_){
 if(block.chainid!=31337||core_==address(0)||core_.code.length==0)revert PolicyBlocked();core=ILocalFundingCore(core_);
 LocalFuturesExposureLedger ledger=new LocalFuturesExposureLedger(core_,address(this));
 if(address(ledger.core())!=core_||ledger.funding()!=address(this))revert Forbidden();exposureLedger=ledger;
 Calculation calculation=new Calculation();
 if(address(calculation).code.length==0||keccak256(address(calculation).code)!=keccak256(type(Calculation).runtimeCode))revert Forbidden();studyCalculation=calculation;
}
 function productionEnabled() external pure returns(bool){return false;}
 function _domain(uint256 id) private view returns(Domain memory d){(d.token,d.governor,d.decimals_)=core.fundingStudyDomain(id);}
 function _gov(Domain memory d) private view {if(msg.sender!=d.governor)revert Forbidden();}
    // LOCAL RESEARCH LEDGER ONLY. Never called from the existing position/custody path.
    struct FundingStudy {
        uint256 start; uint256 end; uint256 last; uint256 longOI; uint256 shortOI;
        uint256 le; uint256 se; uint256 matched; uint256 count; uint256 done; uint256 capacity;
        uint256 rate; bytes32 policy; bool sealed_; bool converted; bool longPays;
        M.Fraction total; uint256 debts; uint256 claims; uint256 collected; uint256 paid;
        uint256 cash; uint256 reserved; uint256 escrow; uint256 pnlCash; uint256 feeCash; uint256 deposited;
    }
    struct FundingMember {
        bool seen; bool fixed_; bool configured; uint256 last; uint256 l; uint256 s;
        uint256 le; uint256 se; uint256 debt; uint256 claim; uint256 debtRem; uint256 claimRem;
        uint256 debtDen; uint256 claimDen; uint256 received; uint256 paid; uint256 credit;
        uint256 pnlDue; uint256 feeDue; uint256 used; uint256 pnlAllocated; uint256 allocationReserve;
    }
    mapping(uint256=>FundingStudy) private fundingStudies;
    mapping(uint256=>mapping(address=>FundingMember)) private fundingMembers;
    mapping(address=>uint256) public fundingStudyCustody;
    event FundingStudyChanged(uint256 indexed domainId,address indexed account,uint256 collected,uint256 paid);
    function fundingStudy(uint256 id) external view returns(uint256[18] memory v,bytes32 policy,bool converted){
        FundingStudy storage e=fundingStudies[id];
        v=[e.start,e.end,e.last,e.longOI,e.le,e.se,e.matched,uint256(e.total.n),e.total.d,e.collected,e.paid,e.cash,e.reserved,e.escrow,e.pnlCash,e.feeCash,e.deposited,e.debts];
        return(v,e.policy,e.converted);
    }
    function fundingMember(uint256 id,address who) external view returns(uint256[12] memory v){
        FundingMember storage a=fundingMembers[id][who];
        return [a.debt,a.claim,a.debtRem,a.claimRem,a.debtDen,a.claimDen,a.received,a.paid,a.pnlAllocated,a.allocationReserve,a.credit,a.feeDue];
    }
    function startFundingStudy(uint256 id,uint256 seconds_,uint256 rateBps,uint256 slots,bytes32 policy) external lock {
 _registryGuard(id);

        _gov(_domain(id));address registry_=core.domainRegistry();if(registry_!=address(0))ILocalFuturesFundingOperationRegistry(registry_).assertFundingPolicy(id,policy);FundingStudy storage e=fundingStudies[id];
        if(e.start!=0||seconds_==0||seconds_>86400||rateBps>1||slots==0||slots>32||policy==bytes32(0))revert PolicyBlocked();
        // One bounded research epoch per domain. No production defaults or historical reuse.
        e.start=block.timestamp;e.last=block.timestamp;e.end=block.timestamp+seconds_;e.rate=rateBps;e.capacity=slots;e.policy=policy;
    }
    function _fundingCheckpoint(FundingStudy storage e) private returns(uint256 t){
        if(e.start==0||e.sealed_)revert WrongState();
        (t,e.le,e.se,e.matched)=studyCalculation.checkpointEpoch([block.timestamp,e.end,e.last,e.longOI,e.shortOI,e.le,e.se,e.matched]);e.last=t;
    }
    function _memberCheckpoint(FundingMember storage a,uint256 t) private {
        (a.le,a.se)=studyCalculation.checkpointMember(t,a.last,a.l,a.s,a.le,a.se);a.last=t;
    }
    function setFundingStudyOI(uint256 id,uint256 longOI,uint256 shortOI) external lock {
 _registryGuard(id);

        _domain(id);FundingStudy storage e=fundingStudies[id];uint256 t=_fundingCheckpoint(e);
        if(t==e.end||longOI>1e24||shortOI>1e24||longOI!=0&&shortOI!=0)revert Invalid();
        FundingMember storage a=fundingMembers[id][msg.sender];
        if(!a.seen){if(e.count==e.capacity)revert PolicyBlocked();a.seen=true;a.last=e.start;e.count++;}
        _memberCheckpoint(a,t);e.longOI=e.longOI-a.l+longOI;e.shortOI=e.shortOI-a.s+shortOI;
        if(e.longOI>1e24||e.shortOI>1e24)revert Invalid();a.l=longOI;a.s=shortOI;
    }
    function sealFundingStudy(uint256 id) external lock {
 _registryGuard(id);

        FundingStudy storage e=fundingStudies[id];if(block.timestamp<e.end)revert WrongState();_fundingCheckpoint(e);
        e.sealed_=true;(e.longPays,e.total)=studyCalculation.sealTotal(e.start,e.end,e.le,e.se,e.matched,e.rate);
    }
    function convertFundingStudy(uint256 id,bool acknowledgedMockPolicy) external lock {
 _registryGuard(id);

        Domain memory d=_domain(id);_gov(d);FundingStudy storage e=fundingStudies[id];
        if(!e.sealed_||e.converted)revert WrongState();if(!acknowledgedMockPolicy)revert PolicyBlocked();
        // Only explicit LOCAL mock observation acceptance. Failed reads leave AwaitingConversion.
        (,uint256 price,,)=core.observe(id);e.total=studyCalculation.convertTotal(e.total,d.decimals_,price);e.converted=true;
    }
    function materializeFundingStudy(uint256 id,address who) external lock {
 _registryGuard(id);

        FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][who];
        if(!e.converted||!a.seen||a.fixed_)revert WrongState();_memberCheckpoint(a,e.end);a.fixed_=true;e.done++;
        uint256[6] memory rights=studyCalculation.memberRights(e.total,e.longPays,e.le,e.se,a.le,a.se);
        a.debt=rights[0];a.claim=rights[1];a.debtRem=rights[2];a.claimRem=rights[3];a.debtDen=rights[4];a.claimDen=rights[5];
        e.debts+=a.debt;e.claims+=a.claim;if(a.debtRem!=0)fundingObligationCounts[id].debtFractions++;if(a.claimRem!=0)fundingObligationCounts[id].claimFractions++;
    }
    function depositFundingStudy(uint256 id,uint256 amount) external lock {
 _registryGuard(id);
_depositFundingStudy(id,msg.sender,amount);}
    function _depositFundingStudy(uint256 id,address beneficiary,uint256 amount) private {
        Domain memory d=_domain(id);FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][beneficiary];
        if(e.start==0||amount==0||amount>1e36)revert Invalid();
        if(depositsClosed[id]||!a.seen||!a.fixed_||partialOnly[id][beneficiary]||closedPartialReservation[partialReservation[id][beneficiary]])revert PolicyBlocked();
        if(a.debt==a.received&&(!a.configured||(a.used==a.pnlDue+a.debt&&a.feeDue==0)))revert PolicyBlocked();
        IFundingToken token=IFundingToken(d.token);uint256 before_=token.balanceOf(address(this));
        if(!token.transferFrom(msg.sender,address(this),amount)||token.balanceOf(address(this))-before_!=amount)revert TransferFailed();
        fundingMembers[id][beneficiary].credit+=amount;e.escrow+=amount;e.deposited+=amount;fundingStudyCustody[d.token]+=amount;
    }
    function configureFundingGrossStudy(uint256 id,address who,uint256 pnlDue,uint256 feeDue) external lock {
 _registryGuard(id);

        _gov(_domain(id));FundingMember storage a=fundingMembers[id][who];
        if(depositsClosed[id]||partialOnly[id][who]||!a.fixed_||a.configured||a.received!=0||pnlDue>1e36||feeDue>1e36)revert WrongState();
        a.configured=true;a.pnlDue=pnlDue;a.feeDue=feeDue;legacyNonFundingDue[id]+=pnlDue+feeDue;
    }
    function collectFundingStudy(uint256 id) external lock {
 _registryGuard(id);
_collectFundingStudy(id,msg.sender);}
    // Explicit new sponsor cash only; not a proof of actual position PnL or access to LP cash.
    function netFundingStudy(uint256 id,address who,uint256 amount) external lock {
 _registryGuard(id);

        _gov(_domain(id));_depositFundingStudy(id,who,amount);_collectFundingStudy(id,who);
    }
    function _collectFundingStudy(uint256 id,address who) private {
        FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][who];
        if(partialOnly[id][who]||!a.configured||e.done!=e.count||a.credit==0)revert WrongState();
        uint256 total=a.pnlDue+a.debt;
        (uint256 take,uint256 p,uint256 f,uint256 reserve,uint256 fee)=studyCalculation.allocateCollection(a.credit,a.used,a.pnlDue,a.debt,a.feeDue);
        a.credit-=take;a.used+=take;e.escrow-=take;
        legacyNonFundingDue[id]-=p-a.pnlAllocated;
        e.pnlCash+=p-a.pnlAllocated;e.collected+=f-a.received;e.cash+=f-a.received;
        // Allocation reserve is real escrow, never LP income or available credit.
        e.escrow=e.escrow+reserve-a.allocationReserve;a.allocationReserve=reserve;a.pnlAllocated=p;a.received=f;
        if(a.used==total){a.credit-=fee;a.feeDue-=fee;e.escrow-=fee;e.feeCash+=fee;legacyNonFundingDue[id]-=fee;}
        emit FundingStudyChanged(id,msg.sender,e.collected,e.paid);
    }
    function reserveFundingStudy(uint256 id) external lock {
 _registryGuard(id);

        FundingStudy storage e=fundingStudies[id];if(!e.converted||e.done!=e.count)revert WrongState();
        uint256 target=e.collected<e.claims?e.collected:e.claims;e.reserved=target-e.paid;
    }
    function claimFundingStudy(uint256 id,uint256 amount) external lock {
 _registryGuard(id);

        Domain memory d=_domain(id);FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][msg.sender];
        if(partialOnly[id][msg.sender]||e.done!=e.count||!a.fixed_||e.claims==0||amount==0)revert WrongState();
        uint256 capital=e.reserved+e.paid;uint256 due=M.mulDiv(a.claim,capital,e.claims,false)-a.paid;
        if(amount>due)revert Insufficient();a.paid+=amount;e.paid+=amount;e.cash-=amount;e.reserved-=amount;fundingStudyCustody[d.token]-=amount;
        IFundingToken token=IFundingToken(d.token);uint256 before_=token.balanceOf(address(this));uint256 dest=token.balanceOf(msg.sender);
        if(!token.transfer(msg.sender,amount)||before_-token.balanceOf(address(this))!=amount||token.balanceOf(msg.sender)-dest!=amount)revert TransferFailed();
        emit FundingStudyChanged(id,msg.sender,e.collected,e.paid);
    }
    function fundingStudyInvariant(uint256 id) external view returns(bool,bool){
        Domain memory d=_domain(id);FundingStudy storage e=fundingStudies[id];
        return(e.cash+e.paid==e.collected&&e.reserved<=e.cash&&e.escrow+e.pnlCash+e.feeCash+e.cash+e.paid+refundedCreditTotal[id]==e.deposited,IFundingToken(d.token).balanceOf(address(this))>=fundingStudyCustody[d.token]);
    }

 // Core-only research collection; no token pull or position mutation is authorized here.
 function collectFromCore(uint256 id,uint256 epoch,bytes32 settlementId,address account) external lock {
 _registryGuard(id);

  if(msg.sender!=address(core)||epoch!=1||settlementId==bytes32(0)||account==address(0))revert Forbidden();
  _domain(id);if(fundingStudies[id].start==0)revert WrongState();
  bytes32 key=keccak256(abi.encode(address(core),id,epoch,settlementId,account));
  if(researchSettled[key])revert Duplicate();researchSettled[key]=true;_collectFundingStudy(id,account);
 }

    mapping(bytes32=>uint256) private partialSequences;
    mapping(uint256=>mapping(address=>bytes32)) public partialReservation;
    mapping(uint256=>mapping(address=>bool)) private partialOnly;
    function partialBasis(uint256 id,address who) external view returns(uint256 debt,uint256 claim_){
        FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][who];
        if(closedPartialReservation[partialReservation[id][who]]||!e.sealed_||!e.converted||e.done!=e.count||!a.fixed_||a.configured||(!partialOnly[id][who]&&(a.received!=0||a.paid!=0)))revert WrongState();return(a.debt,a.claim);
    }
    function _partialCaller() private view {if(msg.sender!=core.localPartial()||msg.sender==address(0))revert Forbidden();}
    function _partialKey(uint256 id,address who,uint256 positionId,uint256 epoch) private view returns(bytes32){return keccak256(abi.encode(address(core),address(this),core.localPartial(),id,who,positionId,epoch));}
    function reservePartial(uint256 id,address who,uint256 positionId,uint256 epoch) external lock returns(uint256 debt,uint256 claim_){
 _registryGuard(id);

        _partialCaller();if(depositsClosed[id]||epoch!=1||positionId==0||who==address(0)||partialReservation[id][who]!=bytes32(0))revert Forbidden();
        (debt,claim_)=this.partialBasis(id,who);FundingMember storage a=fundingMembers[id][who];if(a.credit!=0)revert WrongState();
        partialReservation[id][who]=_partialKey(id,who,positionId,epoch);partialOnly[id][who]=true;fundingObligationCounts[id].activeReservations++;
    }
    function partialTransfer(uint256 id,address who,uint256 positionId,uint256 epoch,uint256 sequence,uint256 debt,uint256 claim_) external lock {
 _registryGuard(id);

        _partialCaller();bytes32 key=_partialKey(id,who,positionId,epoch);
        if(epoch!=1||key!=partialReservation[id][who]||sequence!=partialSequences[key]+1)revert Forbidden();
        this.partialBasis(id,who);Domain memory d=_domain(id);FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][who];
        if(debt>a.debt-a.received||claim_>a.claim-a.paid)revert Insufficient();partialSequences[key]=sequence;partialOnly[id][who]=true;
        IFundingToken t=IFundingToken(d.token);uint256 before_=t.balanceOf(address(this));
        if(debt!=0){if(!t.transferFrom(msg.sender,address(this),debt)||t.balanceOf(address(this))-before_!=debt)revert TransferFailed();a.received+=debt;e.deposited+=debt;e.collected+=debt;e.cash+=debt;fundingStudyCustody[d.token]+=debt;}
        uint256 capital=e.collected<e.claims?e.collected:e.claims;
        uint256 due=e.claims==0?0:M.mulDiv(a.claim,capital,e.claims,false)-a.paid;if(claim_>due)revert Insufficient();
        if(claim_!=0){uint256 destination=t.balanceOf(msg.sender);uint256 source=t.balanceOf(address(this));a.paid+=claim_;e.paid+=claim_;e.cash-=claim_;fundingStudyCustody[d.token]-=claim_;if(!t.transfer(msg.sender,claim_)||source-t.balanceOf(address(this))!=claim_||t.balanceOf(msg.sender)-destination!=claim_)revert TransferFailed();}
        e.reserved=capital-e.paid;
    }

    struct FundingObligationCounts {uint256 activeReservations;uint256 debtFractions;uint256 claimFractions;}
    mapping(uint256=>FundingObligationCounts) public fundingObligationCounts;
    mapping(bytes32=>bool) public closedPartialReservation;
    event PartialReservationClosed(uint256 indexed id,address indexed account,bytes32 key,uint256 sequence);
    function fundingObligations(uint256 id) external view returns(bool ready,uint256[10] memory v){
        _domain(id);FundingStudy storage e=fundingStudies[id];FundingObligationCounts storage o=fundingObligationCounts[id];
        ready=e.start==0||(depositsClosed[id]&&e.sealed_&&e.converted&&e.done==e.count);
        v=[e.count-e.done,o.activeReservations,e.debts-e.collected,e.claims-e.paid,o.debtFractions,o.claimFractions,e.escrow,e.cash,e.pnlCash,e.feeCash];
    }
    function memberObligations(uint256 id,address who) external view returns(bytes32 key,bool closed,uint256[9] memory v){
        FundingMember storage a=fundingMembers[id][who];key=partialReservation[id][who];closed=closedPartialReservation[key];
        v=[a.debt-a.received,a.claim-a.paid,a.debtRem,a.debtDen,a.claimRem,a.claimDen,a.credit,a.allocationReserve,a.feeDue];
    }
    function closePartialReservation(uint256 id,address who,uint256 positionId,uint256 epoch,uint256 sequence) external lock {
 _registryGuard(id);

        _partialCaller();bytes32 key=_partialKey(id,who,positionId,epoch);FundingMember storage a=fundingMembers[id][who];
        if(epoch!=1||key!=partialReservation[id][who]||closedPartialReservation[key]||sequence!=partialSequences[key]||!IPartialClosure(msg.sender).partialClosure(id,who,positionId,epoch,sequence))revert WrongState();
        if(a.debt!=a.received||a.claim!=a.paid||a.debtRem!=0||a.claimRem!=0||a.credit!=0||a.allocationReserve!=0||a.feeDue!=0)revert Insufficient();
        closedPartialReservation[key]=true;fundingObligationCounts[id].activeReservations--;emit PartialReservationClosed(id,who,key,sequence);
    }

    // Irreversible external-credit window; already-fixed claims and history remain intact.
    mapping(uint256=>bool) public depositsClosed;
    mapping(uint256=>uint256) public refundedCreditTotal;
    mapping(uint256=>uint256) public legacyNonFundingDue;
    event FundingDepositsClosed(uint256 indexed id);
    event FundingCreditRefunded(uint256 indexed id,address indexed account,uint256 amount);
    function closeFundingDeposits(uint256 id) external lock {
 _registryGuard(id);

        _gov(_domain(id));FundingStudy storage e=fundingStudies[id];
        if(depositsClosed[id]||!e.sealed_||!e.converted||e.done!=e.count||e.collected!=e.debts||legacyNonFundingDue[id]!=0)revert WrongState();
        depositsClosed[id]=true;emit FundingDepositsClosed(id);
    }
    function refundableFundingCredit(uint256 id,address who) public view returns(uint256){
        FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][who];
        if(!e.sealed_||!e.converted||e.done!=e.count||!a.seen||!a.fixed_||!a.configured||partialOnly[id][who])return 0;
        uint256 committed=a.pnlDue+a.debt-a.used+a.feeDue;
        return a.credit>committed?a.credit-committed:0;
    }
    function refundFundingCredit(uint256 id,uint256 amount) external lock {
 _registryGuard(id);

        Domain memory d=_domain(id);if(amount==0||amount>refundableFundingCredit(id,msg.sender))revert Insufficient();
        FundingStudy storage e=fundingStudies[id];FundingMember storage a=fundingMembers[id][msg.sender];IFundingToken t=IFundingToken(d.token);
        uint256 source=t.balanceOf(address(this));uint256 destination=t.balanceOf(msg.sender);if(source<fundingStudyCustody[d.token])revert Insufficient();
        a.credit-=amount;e.escrow-=amount;fundingStudyCustody[d.token]-=amount;refundedCreditTotal[id]+=amount;
        if(!t.transfer(msg.sender,amount)||source-t.balanceOf(address(this))!=amount||t.balanceOf(msg.sender)-destination!=amount)revert TransferFailed();
        emit FundingCreditRefunded(id,msg.sender,amount);
    }

    // INDEPENDENT LOCAL namespace: USD rights only. No Core position connection,
    // token conversion, credit, custody, reservation, deposit, payout or refund.
    // All finite schedule parameters are committed before its first epoch starts.
    enum SeriesState {Unset, Accruing, CutoffFixed, AwaitingConversion}
    struct RepeatSeries {
        uint256 origin;uint256 length;uint256 epochs;uint256 batch;uint256 capacity;
        uint256 rate;bytes32 policy;uint256 current;uint256 last;
        uint256 longOI;uint256 shortOI;uint256 active;
    }
    struct RepeatEpoch {
        uint256 start;uint256 cutoff;uint256 last;uint256 le;uint256 se;uint256 matched;
        uint256 participants;uint256 done;uint256 materializedLE;uint256 materializedSE;
        SeriesState state;M.Fraction usd;
    }
    struct RepeatCursor {uint256 epoch;uint256 last;uint256 l;uint256 s;}
    struct RepeatMember {uint256 le;uint256 se;bool enrolled;bool fixed_;M.Fraction debtUsd;M.Fraction claimUsd;}
    mapping(uint256=>mapping(uint256=>RepeatSeries)) private repeatSeries;
    mapping(uint256=>mapping(uint256=>mapping(uint256=>RepeatEpoch))) private repeatEpochs;
    mapping(uint256=>mapping(uint256=>mapping(address=>RepeatCursor))) private repeatCursors;
    mapping(uint256=>mapping(uint256=>mapping(uint256=>mapping(address=>RepeatMember)))) private repeatMembers;
    event SeriesCreated(uint256 indexed domain,uint256 indexed series,uint256 start,uint256 length,uint256 epochs,bytes32 policy);
    event SeriesOI(uint256 indexed domain,uint256 indexed series,address indexed account,uint256 epoch,uint256 longOI,uint256 shortOI);
    event SeriesCutoff(uint256 indexed domain,uint256 indexed series,uint256 indexed epoch,uint256 cutoff);
    event SeriesMemberFixed(uint256 indexed domain,uint256 indexed series,uint256 indexed epoch,address account);
    event SeriesAwaitingConversion(uint256 indexed domain,uint256 indexed series,uint256 indexed epoch);
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    // Appended state preserves every legacy/repeating storage root.
    enum InputMode {Unset,ResearchInput,CoreInput}
    mapping(uint256=>mapping(uint256=>InputMode)) private preserved_seriesInputMode;
    mapping(bytes32=>uint256) private preserved_coreExposureSequences;
    event CoreExposureRecorded(bytes32 indexed key,uint256 indexed sequence,bytes32 receipt);
    

    // OPT-IN LOCAL clock-only PolicyGap. No rate, USD amount, conversion or cash.
    // All new state is appended; normal epoch integrals/rights remain immutable.
    struct GapClock {uint256 last;uint256 l;uint256 s;uint256 le;uint256 se;}
    struct GapSeries {GapClock clock;bool enabled;bool unresolved;}
    struct GapPosition {GapClock clock;bool closed;bool touched;}
    mapping(uint256=>mapping(uint256=>GapSeries)) private gapSeries;
    mapping(uint256=>mapping(uint256=>mapping(address=>GapClock))) private gapAccounts;
    mapping(bytes32=>GapPosition) private gapPositions;
    event GapStudyEnabled(uint256 indexed domain,uint256 indexed series,uint256 cutoff);
    event GapExposure(bytes32 indexed key,uint256 timestamp,uint256 longExposure,uint256 shortExposure,bool closed);
    
    
    
    
    

 // Fresh deployment only; no historical state is imported or reset.
 LocalFuturesExposureLedger public immutable exposureLedger;
 function createFundingSeries(uint256 id,uint256 sid,uint256 start,uint256 length,uint256 epochs,uint256 batch,uint256 capacity,uint256 rate,bytes32 policy) external lock {
 _registryGuard(id);
_gov(_domain(id));exposureLedger.createFundingSeries(id,sid,start,length,epochs,batch,capacity,rate,policy,msg.sender);}
 function createCoreFundingSeries(uint256 id,uint256 sid,uint256 start,uint256 length,uint256 epochs,uint256 batch,uint256 capacity,uint256 rate,bytes32 policy) external lock {
 _registryGuard(id);
if(msg.sender!=address(core))revert Forbidden();_domain(id);exposureLedger.createCoreFundingSeries(id,sid,start,length,epochs,batch,capacity,rate,policy,msg.sender);}
 function advanceFundingSeries(uint256 id,uint256 sid,uint256 limit) external lock {
 _registryGuard(id);
exposureLedger.advanceFundingSeries(id,sid,limit);}
 function checkpointFundingAccount(uint256 id,uint256 sid,address who,uint256 limit) external lock {
 _registryGuard(id);
exposureLedger.checkpointFundingAccount(id,sid,who,limit);}
 function setSeriesOI(uint256 id,uint256 sid,uint256 longOI,uint256 shortOI) external lock {
 _registryGuard(id);
exposureLedger.setSeriesOI(id,sid,longOI,shortOI,msg.sender);}
 function fixSeriesMemberUSD(uint256 id,uint256 sid,uint256 epoch,address who) external lock {
 _registryGuard(id);
exposureLedger.fixSeriesMemberUSD(id,sid,epoch,who);}
 function finalizeSeriesUSD(uint256 id,uint256 sid,uint256 epoch) external lock {
 _registryGuard(id);
exposureLedger.finalizeSeriesUSD(id,sid,epoch);}
 function convertSeriesEpoch(uint256,uint256,uint256) external pure {revert PolicyBlocked();}
 function fundingSeries(uint256 id,uint256 sid) external view returns(uint256[11] memory v,bytes32 policy){return exposureLedger.fundingSeries(id,sid);}
 function fundingSeriesEpoch(uint256 id,uint256 sid,uint256 epoch) external view returns(uint256[11] memory v,int256 usdN,uint256 usdD){if(msg.sender==payoutSpecification&&repeatPayoutEpochs[id].started)revert PolicyBlocked();return exposureLedger.fundingSeriesEpoch(id,sid,epoch);}
 function fundingSeriesAccount(uint256 id,uint256 sid,address who) external view returns(uint256[4] memory){return exposureLedger.fundingSeriesAccount(id,sid,who);}
 function fundingSeriesMember(uint256 id,uint256 sid,uint256 epoch,address who) external view returns(uint256[8] memory){return exposureLedger.fundingSeriesMember(id,sid,epoch,who);}
 function seriesInputMode(uint256 id,uint256 sid) external view returns(InputMode){return InputMode(uint8(exposureLedger.seriesInputMode(id,sid)));}
 function coreExposureSequences(bytes32 key) external view returns(uint256){return exposureLedger.coreExposureSequences(key);}
 function recordCoreExposure(uint256 id,uint256 sid,address account,uint256 positionId,uint256 sequence,bytes32 policy,uint256 expectedLong,uint256 expectedShort,uint256 nextLong,uint256 nextShort) external lock returns(bytes32 receipt){
 _registryGuard(id);
if(msg.sender!=address(core))revert Forbidden();return exposureLedger.recordCoreExposure(id,sid,account,positionId,sequence,policy,expectedLong,expectedShort,nextLong,nextShort,msg.sender);}
 function enablePolicyGapStudy(uint256 id,uint256 sid) external lock {
 _registryGuard(id);
_gov(_domain(id));exposureLedger.enablePolicyGapStudy(id,sid,msg.sender);}
 function policyGap(uint256 id,uint256 sid,address account,uint256 positionId) external view returns(uint256[12] memory v,bool closed,bool unresolved){return exposureLedger.policyGap(id,sid,account,positionId);}


 // Repeat custody only; execution progression lives in the fixed no-custody module.
 address public collectionCoordinator;
 address public collectionExecutor;
 mapping(bytes32=>uint256) public repeatAccountCollected;
 mapping(bytes32=>uint256) public repeatCash;
 mapping(address=>uint256) public repeatCustody;
 function bindCollectionCoordinator(address module,address executor_) external lock {
 if(core.domainRegistry()!=address(0))revert PolicyBlocked();

  if(msg.sender!=core.governance()||collectionCoordinator!=address(0)||module.code.length==0||executor_.code.length==0)revert Forbidden();
  // Executor constructor checks all reverse bindings; this hash fixes the same four addresses.
  if(ICollectionExecution(executor_).contextHash()!=keccak256(abi.encode(address(core),address(this),core.localPartial(),module)))revert Forbidden();
  collectionCoordinator=module;collectionExecutor=executor_;
 }
 function collectRepeat(uint256 id,bytes32 accountKey,bytes32 epochKey,uint256 amount,uint256 accountLimit) external lock {
 _registryGuard(id);
 if(repeatPayoutEpochs[id].started)revert PolicyBlocked();

  _partialCaller();
  if(amount==0||ICollectionExecution(collectionExecutor).fundingAuthorization()!=keccak256(msg.data)||repeatAccountCollected[accountKey]+amount>accountLimit)revert Forbidden();
  Domain memory d=_domain(id);IFundingToken t=IFundingToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 source=t.balanceOf(msg.sender);
  if(before_<fundingStudyCustody[d.token]+repeatCustody[d.token]||!t.transferFrom(msg.sender,address(this),amount)||t.balanceOf(address(this))-before_!=amount||source-t.balanceOf(msg.sender)!=amount)revert TransferFailed();
  repeatAccountCollected[accountKey]+=amount;repeatCash[epochKey]+=amount;repeatCustody[d.token]+=amount;
 }

 address public payoutExecutor;
 address public payoutSpecification;
 struct RepeatPayoutEpoch {uint256 paid;uint256 reserved;bool started;}
 struct RepeatPayoutAccount {uint256 paid;uint256 sequence;bytes32 preparation;uint256 limit;}
 mapping(uint256=>RepeatPayoutEpoch) private repeatPayoutEpochs;
 mapping(bytes32=>RepeatPayoutAccount) private repeatPayoutAccounts;
 mapping(bytes32=>bytes32) private repeatPayoutReceipts;
 function repeatPayoutState(uint256 id,bytes32 rightsKey,bytes32 receipt) external view returns(RepeatPayoutEpoch memory epoch,RepeatPayoutAccount memory account,bytes32 commitment){
  return(repeatPayoutEpochs[id],repeatPayoutAccounts[rightsKey],repeatPayoutReceipts[receipt]);
 }
 function bindPayoutExecutor(address module) external lock {
  if(core.domainRegistry()!=address(0)||msg.sender!=core.governance()||payoutExecutor!=address(0)||module.code.length==0)revert Forbidden();
  address source=IRepeatPayoutExecutor(module).validateBinding(address(core),core.localPartial(),collectionCoordinator);
  if(source.code.length==0)revert Forbidden();payoutExecutor=module;payoutSpecification=source;
 }
 function payRepeat(uint256 id,address who,bytes32 preparation,uint256 sequence,uint256 amount) external lock returns(bytes32 receipt,uint256 cumulative){
  address registry=core.domainRegistry();if(registry!=address(0))ILocalDomainRegistry(registry).assertLegacyDomain(id);
  _partialCaller();if(payoutExecutor==address(0)||amount==0)revert Forbidden();
  (bytes32 rightsKey,bytes32 epochKey,uint256 limit)=IRepeatPayoutExecutor(payoutExecutor).authorizePayout(id,who,preparation);
  RepeatPayoutEpoch storage e=repeatPayoutEpochs[id];RepeatPayoutAccount storage a=repeatPayoutAccounts[rightsKey];
  if(a.preparation==bytes32(0)){a.preparation=preparation;a.limit=limit;}
  if(sequence!=a.sequence+1||a.preparation!=preparation||a.limit!=limit||a.paid+amount>a.limit||e.paid+e.reserved+amount>repeatCash[epochKey])revert Insufficient();
  Domain memory d=_domain(id);IFundingToken t=IFundingToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 destination=t.balanceOf(msg.sender);
  if(before_<fundingStudyCustody[d.token]+repeatCustody[d.token]||repeatCustody[d.token]<amount)revert Insufficient();
  e.started=true;e.reserved+=amount;a.paid+=amount;a.sequence=sequence;e.paid+=amount;repeatCustody[d.token]-=amount;
  receipt=keccak256(abi.encode(rightsKey,sequence));cumulative=a.paid;
  if(repeatPayoutReceipts[receipt]!=bytes32(0))revert Forbidden();repeatPayoutReceipts[receipt]=keccak256(abi.encode(msg.data,cumulative));
  e.reserved-=amount;
  if(!t.transfer(msg.sender,amount)||before_-t.balanceOf(address(this))!=amount||t.balanceOf(msg.sender)-destination!=amount)revert TransferFailed();
  emit RepeatFundingPaid(receipt,id,who,sequence,amount,cumulative);
 }
 event RepeatFundingPaid(bytes32 indexed receipt,uint256 indexed domain,address indexed account,uint256 sequence,uint256 amount,uint256 cumulative);

 function registryGuardVersion() external pure returns(uint256){return 1;}
 function _registryGuard(uint256 id) private view {address r=core.domainRegistry();if(r!=address(0))ILocalFuturesFundingOperationRegistry(r).assertOperation(id,msg.sig);}
}
