// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore as Core} from "./LocalFuturesCore.sol";
import {LocalFuturesFundingV11 as Funding} from "./LocalFuturesFundingV11.sol";
import {LocalFuturesSettlementCoordinator as Coordinator} from "./LocalFuturesSettlementCoordinator.sol";
import {LocalFuturesAttribution as Attribution} from "./LocalFuturesAttribution.sol";
import {LocalFuturesPartialSettlement as Partial} from "./LocalFuturesPartialSettlement.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface ICompletionBase {
 function core() external view returns(address);function funding() external view returns(address);function attribution() external view returns(address);
 function linkedBasis(uint256) external view returns(Partial.LinkedBasis memory);
 function linkedExit(uint256,uint256,bool) external view returns(Partial.LinkedExit memory);
 function linkedConsumed(uint256) external view returns(uint256);
 function releases(uint256) external view returns(uint256,uint256,bytes32);
}
interface ICompletionPartial is ICompletionBase {
 function repeatReceiptState(uint256,bytes32,bytes32) external view returns(uint256,uint256,bool);
 function partialPool(uint256) external view returns(uint256[12] memory);
 function linkedHeld(uint256) external view returns(uint256);
 function tokenAccounted(address) external view returns(uint256);
}
interface ICompletionCollection {
 struct Execution {uint256 sequence;uint256 budget;uint256 pnl;uint256 funding;uint256 fee;bytes32 specification;}
 function core() external view returns(address);function funding() external view returns(address);function partialSettlement() external view returns(address);function coordinator() external view returns(address);
 function contextHash() external view returns(bytes32);function executions(bytes32) external view returns(Execution memory);function consumedSpecifications(bytes32) external view returns(bool);
}
interface ICompletionToken {function balanceOf(address) external view returns(uint256);}
/// @notice LOCAL read-only completion evidence. Never payment or release authorization.
contract LocalFuturesSettlementCompletionVerifier {
 Core public immutable core;address public immutable funding;address public immutable partialSettlement;
 address public immutable attribution;address public immutable coordinator;address public immutable collectionExecutor;bytes32 public immutable peerCodeHash;
 error Forbidden();error SettlementPending();
 constructor(address core_,address funding_,address partial_){
  if(block.chainid!=31337||core_.code.length==0||funding_.code.length==0||partial_.code.length==0)revert Forbidden();
  core=Core(payable(core_));funding=funding_;partialSettlement=partial_;if(msg.sender!=core.governance())revert Forbidden();
  EvidencePeers memory v=_evidencePeers();attribution=address(v.a);coordinator=address(v.c);collectionExecutor=address(v.x);peerCodeHash=_codeHash(v);
 }
 function productionEnabled() external pure returns(bool){return false;}
 function _codeHash(EvidencePeers memory v) private view returns(bytes32){return keccak256(abi.encode(address(core).codehash,funding.codehash,partialSettlement.codehash,address(v.a).codehash,address(v.c).codehash,address(v.x).codehash));}
 // Read-only evidence, never an authorization to release, transfer or withdraw.
 uint256 private constant UNFINISHED=1;uint256 private constant GAP=2;uint256 private constant NO_PLAN=4;uint256 private constant FRACTION=8;
 uint256 private constant UNFUNDED=16;uint256 private constant UNPAID=32;uint256 private constant RESERVED=64;uint256 private constant PROFIT=128;
 uint256 private constant RELEASED=256;uint256 private constant STALE=512;uint256 private constant CUSTODY=1024;uint256 private constant ACCOUNT=2048;
 struct PositionEvidence {
  uint256 pid;uint256 finalSequence;bytes32 planHash;bytes32 epochRoot;bytes32 positionKey;bytes32 specification;uint256 executionSequence;
  M.Fraction[5] gross;uint256[3] executed;uint256 held;uint256 consumed;uint256 released;uint256 remaining;uint256 blockers;
 }
 struct CompletionEvidence {
  address account;uint256 domain;uint256 series;bytes32 policyContext;bytes32 accountKey;bytes32 epochKey;bytes32 historyRoot;
  PositionEvidence position;uint256[7] accountFunding;uint256[6] roundFunding;uint256 blockers;bool complete;bytes32 commitment;
 }
 struct EvidencePeers {Funding f;Coordinator c;Attribution a;ICompletionCollection x;ICompletionPartial p;}
 function _units(M.Fraction memory value) private pure returns(uint256 result,uint256 blockers){
  if(value.d==0||value.n<0)revert SettlementPending();result=uint256(value.n)/value.d;if(uint256(value.n)%value.d!=0)blockers=FRACTION;
 }
 function _rawUnits(M.Fraction memory usd,uint256 price,uint8 decimals_) private pure returns(uint256,uint256){
  if(usd.d==0||usd.n<0||price==0)revert SettlementPending();return _units(M.scaleFraction(usd,10**decimals_,price));
 }
 function _evidencePeers() private view returns(EvidencePeers memory v){
  v.f=Funding(funding);v.c=Coordinator(v.f.collectionCoordinator());v.p=ICompletionPartial(partialSettlement);v.a=Attribution(v.p.attribution());v.x=ICompletionCollection(v.f.collectionExecutor());
  if(block.chainid!=31337||funding.code.length==0||partialSettlement.code.length==0||address(v.c).code.length==0||address(v.a).code.length==0||address(v.x).code.length==0||core.localFunding()!=funding||core.localPartial()!=partialSettlement||address(v.f.core())!=address(core)||v.p.core()!=address(core)||v.p.funding()!=funding||address(v.c.core())!=address(core)||address(v.c.funding())!=funding||address(v.c.partialSettlement())!=partialSettlement||address(v.c.attribution())!=address(v.a)||address(v.a.core())!=address(core)||v.a.funding()!=funding||v.a.partialSettlement()!=partialSettlement||v.x.core()!=address(core)||v.x.funding()!=funding||v.x.partialSettlement()!=partialSettlement||v.x.coordinator()!=address(v.c)||v.x.contextHash()!=keccak256(abi.encode(address(core),funding,partialSettlement,address(v.c))))revert SettlementPending();
 }
 function _positionEvidence(EvidencePeers memory v,Coordinator.Policy memory policy,uint256 id,address who,bytes32 accountKey,uint256 pid) private view returns(PositionEvidence memory out){
  (address owner,uint256[5] memory q,bytes32 fp)=core.coreExposureContext(pid);Partial.LinkedBasis memory b=v.p.linkedBasis(pid);
  if(owner!=who||q[0]!=id||q[1]!=policy.sid||q[3]+q[4]!=0||q[2]!=b.sequence||fp!=policy.fundingPolicy||b.initialSize==0||b.closed!=b.initialSize||b.held!=b.margin||v.f.coreExposureSequences(b.key)!=b.sequence)revert SettlementPending();
  out.pid=pid;out.finalSequence=b.sequence;out.held=b.held;out.consumed=v.p.linkedConsumed(pid);bytes32 releaseCompletion;uint256 releaseSequence;(out.released,releaseSequence,releaseCompletion)=v.p.releases(pid);
  if(out.consumed+out.released>b.held)revert SettlementPending();out.remaining=b.held-out.consumed-out.released;if(out.released!=0||releaseSequence!=0||releaseCompletion!=bytes32(0))out.blockers|=RELEASED;
  (,bool closed_,bool gap)=v.f.policyGap(id,policy.sid,who,pid);if(!closed_||gap)out.blockers|=GAP;
  uint256 ordinal=v.a.finalOrdinal(pid);if(ordinal==0||ordinal==type(uint256).max)out.blockers|=UNFINISHED;
  Coordinator.Plan memory plan=v.c.plan(pid);Coordinator.SealedPlan memory seal=v.c.sealedPlan(pid);
  if(plan.id==bytes32(0)||seal.settlementId==bytes32(0)){out.blockers|=NO_PLAN;return out;}
  Partial.LinkedExit memory exit_=v.p.linkedExit(pid,b.sequence,true);
  if(plan.pid!=pid||plan.domain!=id||plan.accountKey!=accountKey||plan.sequence!=b.sequence||plan.firstEpoch!=1||plan.lastEpoch!=1||plan.plannedMargin!=b.margin||seal.limit!=b.held||seal.planHash!=keccak256(abi.encode(plan))||exit_.status!=2||exit_.closed!=b.initialSize||exit_.timestamp!=policy.mock.exitTime||exit_.market!=policy.mock.exitMarket18||exit_.collateral!=policy.mock.exitCollateral18||exit_.marketTime!=exit_.timestamp||exit_.collateralTime!=exit_.timestamp||exit_.cutoff!=policy.origin+policy.duration)revert SettlementPending();
  Attribution.Total memory total=v.a.accountEpoch(id,who,1);if(!total.done){out.blockers|=UNFINISHED;return out;}
  (,,M.Fraction memory debt,M.Fraction memory claim_)=v.a.positionEpoch(pid,1);
  if(seal.epochRoot!=keccak256(abi.encode(bytes32(0),uint256(1),debt,claim_))||keccak256(abi.encode(debt,claim_))!=keccak256(abi.encode(plan.fundingDebtUsd18,plan.fundingClaimUsd18)))revert SettlementPending();
  out.planHash=seal.planHash;out.epochRoot=seal.epochRoot;out.positionKey=keccak256(abi.encode(address(core),funding,partialSettlement,address(v.c),seal.settlementId));
  out.gross=[plan.pnlLossRaw,plan.fundingDebtRaw,plan.feesRaw,plan.fundingClaimRaw,plan.pnlGainRaw];uint256[3] memory targets;
  for(uint256 i;i<5;i++){(uint256 amount,uint256 reason)=_units(out.gross[i]);out.blockers|=reason;if(i<3)targets[i]=amount;}
  if(plan.pnlGainRaw.n!=0)out.blockers|=PROFIT;if(seal.cumulative.fractionsPending)out.blockers|=FRACTION;if(seal.cumulative.allocationReserve!=0)out.blockers|=RESERVED;
  ICompletionCollection.Execution memory actual=v.x.executions(out.positionKey);out.specification=actual.specification;out.executionSequence=actual.sequence;out.executed=[actual.pnl,actual.funding,actual.fee];
  if(actual.pnl+actual.funding+actual.fee!=out.consumed)revert SettlementPending();
  for(uint256 i;i<3;i++){if(out.executed[i]>targets[i])revert SettlementPending();if(out.executed[i]!=targets[i])out.blockers|=UNFUNDED;}
  if(actual.sequence==0){if(actual.specification!=bytes32(0)||actual.budget!=0||out.consumed!=0)revert SettlementPending();}
  else{
   Coordinator.IntegerSpecification memory s=v.c.integerSpecification(actual.specification);
   if(!v.x.consumedSpecifications(actual.specification)||s.id!=actual.specification||s.sealedId!=seal.settlementId||s.planHash!=seal.planHash||s.accountKey!=accountKey||s.epoch!=1||s.budget!=actual.budget||s.pnlTarget!=actual.pnl||s.fundingTarget!=actual.funding||s.feeTarget!=actual.fee||s.specificationSequence==0||actual.budget>seal.limit||out.consumed>actual.budget)revert SettlementPending();
   if(v.c.latestIntegerSpecification(pid)!=actual.specification||s.calculationStep!=seal.step||s.budget!=seal.budget)out.blockers|=STALE;
  }
 }
 function completionEvidence(uint256 pid,address account) external view returns(CompletionEvidence memory out){
  EvidencePeers memory v=_evidencePeers();if(address(v.a)!=attribution||address(v.c)!=coordinator||address(v.x)!=collectionExecutor||_codeHash(v)!=peerCodeHash)revert SettlementPending();(address owner,uint256[5] memory q,bytes32 fp)=core.coreExposureContext(pid);if(account==address(0)||owner!=account)revert Forbidden();
  out.account=account;out.domain=q[0];Coordinator.Policy memory policy=v.c.mockPolicy(out.domain);Core.Domain memory d=core.domain(out.domain);out.series=policy.sid;
  (uint256[11] memory series,bytes32 seriesPolicy)=v.f.fundingSeries(out.domain,policy.sid);(uint256 sid,bytes32 bp,uint256 longOI,uint256 shortOI)=core.exposureBindings(out.domain);
  if(d.state!=Core.State.Normal||(d.decimals_!=6&&d.decimals_!=18)||policy.sid==0||policy.epochs!=1||series[2]!=1||series[0]!=policy.origin||series[1]!=policy.duration||fp!=policy.fundingPolicy||fp!=d.cfg.policyDigest||seriesPolicy!=fp||sid!=policy.sid||bp!=fp||policy.mock.calculationPolicy!=v.c.CALCULATION_POLICY()||policy.mock.observationTag==bytes32(0)||policy.basisHash!=keccak256(abi.encode("LOCAL_MOCK_ONLY",block.chainid,address(v.c),address(core),funding,partialSettlement,address(v.a),out.domain,d.token,d.decimals_,sid,fp,policy.origin,policy.duration,policy.epochs,policy.mock)))revert SettlementPending();
  out.policyContext=keccak256(abi.encode("GENERAL_COMPLETION_EVIDENCE_NOT_AUTHORIZATION",block.chainid,address(this),address(core),funding,partialSettlement,address(v.a),address(v.c),address(v.x),address(v.x).codehash,d.token,d.decimals_,out.domain,policy));
  out.accountKey=keccak256(abi.encode(address(v.c),address(core),funding,partialSettlement,address(v.a),out.domain,sid,fp,account,policy.basisHash));out.epochKey=keccak256(abi.encode(address(v.c),out.domain,sid,uint256(1),policy.basisHash));
  (uint256 count,uint256 reserved,uint256 live,)=v.a.logs(v.a.accountKey(out.domain,account));if(count==0||count>256)revert SettlementPending();if(reserved!=0)out.blockers|=RESERVED;if(live!=0)out.blockers|=UNFINISHED;if(longOI+shortOI!=0||series[8]+series[9]!=0)out.blockers|=UNFINISHED;
  uint256 opened;uint256 margin;uint256 actualFunding;bool seen;
  for(uint256 i=1;i<=count;i++){Attribution.Transition memory t=v.a.transition(out.domain,account,i);if(t.oldL+t.oldS!=0)continue;if(t.sequence!=1||t.nextL+t.nextS==0)revert SettlementPending();PositionEvidence memory position=_positionEvidence(v,policy,out.domain,account,out.accountKey,t.pid);opened++;margin+=position.held;actualFunding+=position.executed[1];out.blockers|=position.blockers;out.historyRoot=keccak256(abi.encode(out.historyRoot,t,position));if(t.pid==pid){seen=true;out.position=position;}}
  if(!seen)revert SettlementPending();Coordinator.AccountPlan memory aggregate=v.c.accountPlan(out.accountKey);if(aggregate.count!=opened||aggregate.plannedMargin!=margin)out.blockers|=ACCOUNT;
  (uint256[11] memory epoch,int256 usdN,uint256 usdD)=v.f.fundingSeriesEpoch(out.domain,sid,1);uint256[8] memory member=v.f.fundingSeriesMember(out.domain,sid,1,account);Attribution.Total memory total=v.a.accountEpoch(out.domain,account,1);
  if(epoch[10]!=3||epoch[6]!=epoch[7]||epoch[3]!=epoch[8]||epoch[4]!=epoch[9]||block.timestamp<epoch[1]||member[2]!=1||member[3]!=1||!total.done||total.le!=member[0]||total.se!=member[1])out.blockers|=UNFINISHED;
  if(member[5]==0||member[7]==0||usdD==0||usdN<0){out.blockers|=UNFINISHED;}
  else{
   uint256 reason;(out.accountFunding[0],reason)=_rawUnits(M.fraction(M.signed(member[4],false),member[5]),policy.mock.fundingPrice18,d.decimals_);out.blockers|=reason;
   (out.accountFunding[1],reason)=_rawUnits(M.fraction(M.signed(member[6],false),member[7]),policy.mock.fundingPrice18,d.decimals_);out.blockers|=reason;
   (out.roundFunding[0],reason)=_rawUnits(M.fraction(usdN,usdD),policy.mock.fundingPrice18,d.decimals_);out.blockers|=reason;
   if(total.done&&keccak256(abi.encode(total.debt,total.claim_))!=keccak256(abi.encode(M.fraction(M.signed(member[4],false),member[5]),M.fraction(M.signed(member[6],false),member[7]))))out.blockers|=ACCOUNT;
  }
  if(aggregate.count!=0){M.Fraction[5] memory gross=[aggregate.pnlLossRaw,aggregate.fundingDebtRaw,aggregate.feesRaw,aggregate.fundingClaimRaw,aggregate.pnlGainRaw];for(uint256 i;i<5;i++){(,uint256 reason)=_units(gross[i]);out.blockers|=reason;}if(gross[4].n!=0)out.blockers|=PROFIT;Coordinator.Usage memory usage=v.c.accountUsage(out.accountKey,1);if(total.done&&keccak256(abi.encode(usage.debtUsd18,usage.claimUsd18))!=keccak256(abi.encode(total.debt,total.claim_)))out.blockers|=ACCOUNT;}
  out.accountFunding[2]=v.f.repeatAccountCollected(keccak256(abi.encode(out.accountKey,uint256(1))));if(actualFunding!=out.accountFunding[2])revert SettlementPending();if(out.accountFunding[2]>out.accountFunding[0])revert SettlementPending();out.accountFunding[5]=out.accountFunding[0]-out.accountFunding[2];if(out.accountFunding[5]!=0)out.blockers|=UNFUNDED;
  bytes32 rightsKey=keccak256(abi.encode("REPEAT_FUNDING_ACCOUNT_RIGHT",block.chainid,address(core),funding,partialSettlement,address(v.c),out.domain,sid,uint256(1),account,fp,policy.basisHash));
  (Funding.RepeatPayoutEpoch memory paid,Funding.RepeatPayoutAccount memory paidAccount,)=v.f.repeatPayoutState(out.domain,rightsKey,bytes32(0));out.accountFunding[3]=paidAccount.paid;(out.accountFunding[4],,)=v.p.repeatReceiptState(out.domain,rightsKey,bytes32(0));
  if(paidAccount.paid!=out.accountFunding[4]||paidAccount.paid>paidAccount.limit||paidAccount.paid>out.accountFunding[1])revert SettlementPending();out.accountFunding[6]=out.accountFunding[1]-paidAccount.paid;if(out.accountFunding[6]!=0)out.blockers|=UNPAID;
  if(paidAccount.paid!=0){bytes32 receipt=keccak256(abi.encode(rightsKey,paidAccount.sequence));(,,bytes32 commitment)=v.f.repeatPayoutState(out.domain,rightsKey,receipt);(,,bool consumed)=v.p.repeatReceiptState(out.domain,rightsKey,receipt);if(paidAccount.sequence==0||paidAccount.preparation==bytes32(0)||commitment==bytes32(0)||!consumed)revert SettlementPending();}
  out.roundFunding[1]=v.f.repeatCash(out.epochKey);out.roundFunding[2]=paid.paid;out.roundFunding[3]=paid.reserved;if(paid.paid>out.roundFunding[1]||paid.paid>out.roundFunding[0])revert SettlementPending();out.roundFunding[4]=out.roundFunding[1]-paid.paid;out.roundFunding[5]=out.roundFunding[0]-paid.paid;if(out.roundFunding[1]!=out.roundFunding[0])out.blockers|=UNFUNDED;if(out.roundFunding[5]!=0)out.blockers|=UNPAID;if(paid.reserved!=0)out.blockers|=RESERVED;
  uint256[12] memory pool=v.p.partialPool(out.domain);uint256 accounted=v.p.tokenAccounted(d.token);uint256 custody=v.f.repeatCustody(d.token);if(pool[0]!=pool[1]+pool[2]+pool[3]+pool[4]+pool[5]+pool[6]+pool[7]+v.p.linkedHeld(out.domain)||ICompletionToken(d.token).balanceOf(partialSettlement)<accounted||ICompletionToken(d.token).balanceOf(funding)<custody)out.blockers|=CUSTODY;
  out.complete=out.blockers==0;out.commitment=keccak256(abi.encode("READ_ONLY_NOT_RELEASE_OR_PAYMENT",out));
 }
}
