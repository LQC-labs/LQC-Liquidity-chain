// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore as Core} from "./LocalFuturesCore.sol";
import {LocalFuturesFundingV11 as Funding} from "./LocalFuturesFundingV11.sol";
import {LocalFuturesSettlementCoordinator as Coordinator} from "./LocalFuturesSettlementCoordinator.sol";
import {LocalFuturesAttribution as Attribution} from "./LocalFuturesAttribution.sol";
import {LocalFuturesPartialSettlement as Partial} from "./LocalFuturesPartialSettlement.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
import {LocalFuturesSettlementCompletionVerifier as Completion} from "./LocalFuturesSettlementCompletionVerifier.sol";
interface IGeneralReleaseRegistry {function assertGeneralRelease(uint256,bytes4,bytes32) external view;}
interface IReleasePartial {
 function core() external view returns(address);function funding() external view returns(address);function attribution() external view returns(address);
 function linkedBasis(uint256) external view returns(Partial.LinkedBasis memory);
 function linkedExit(uint256,uint256,bool) external view returns(Partial.LinkedExit memory);
 function linkedConsumed(uint256) external view returns(uint256);
 function releases(uint256) external view returns(uint256,uint256,bytes32);
}
interface IGeneralReleasePartial is IReleasePartial {
 function releaseVerifier() external view returns(address);function releaseVerifierCodeHash() external view returns(bytes32);
 function heldReleasePolicy(uint256) external view returns(bytes32);function legacyDomainCutoff() external view returns(uint256);function researchTouched(uint256) external view returns(bool);function lpEnabled(uint256) external view returns(bool);
 function partialPool(uint256) external view returns(uint256[12] memory);function linkedHeld(uint256) external view returns(uint256);function linkedPending(uint256) external view returns(uint256);function linkedFinalReserved(uint256) external view returns(uint256);function repeatReceiptState(uint256,bytes32,bytes32) external view returns(uint256,uint256,bool);
}
/// @notice LOCAL view-only zero-obligation completion. No custody or claim issuance.
contract LocalFuturesReleaseVerifier {
 Core public immutable core;address public immutable funding;address public immutable partialSettlement;
 error Forbidden();error SettlementPending();
 struct Authorization {address account;uint256 domain;uint256 pid;uint256 finalSequence;uint256 amount;bytes32 policyContext;bytes32 completion;}
 constructor(address core_,address funding_,address partial_){
  if(block.chainid!=31337||core_.code.length==0||funding_.code.length==0||partial_==address(0)||partial_.code.length!=0)revert Forbidden();
  core=Core(payable(core_));funding=funding_;partialSettlement=partial_;if(msg.sender!=core.governance()||address(Funding(funding_).core())!=core_||core.localFunding()!=funding_)revert Forbidden();
 }
 function productionEnabled() external pure returns(bool){return false;}
 function context(uint256 id) public view returns(bytes32){
  if(msg.sender!=partialSettlement)revert Forbidden();if(generalReleasePolicy[id]!=bytes32(0)){(bytes32 current,)=_generalPolicy(id);if(current!=generalReleasePolicy[id])revert SettlementPending();return current;}IReleasePartial p=IReleasePartial(partialSettlement);Coordinator c=Coordinator(Funding(funding).collectionCoordinator());Coordinator.Policy memory policy=c.mockPolicy(id);Core.Domain memory d=core.domain(id);
  (uint256[11] memory series,bytes32 fp)=Funding(funding).fundingSeries(id,policy.sid);
  if(block.chainid!=31337||p.core()!=address(core)||p.funding()!=funding||core.localPartial()!=partialSettlement||core.localFunding()!=funding||address(c.core())!=address(core)||address(c.funding())!=funding||address(c.partialSettlement())!=partialSettlement||address(c.attribution())!=p.attribution()||policy.sid==0||policy.epochs!=1||series[2]!=1||series[5]!=0||fp!=policy.fundingPolicy||fp!=d.cfg.policyDigest||policy.mock.calculationPolicy!=c.CALCULATION_POLICY()||policy.mock.observationTag==bytes32(0)||policy.basisHash==bytes32(0)||d.state!=Core.State.Normal||(d.decimals_!=6&&d.decimals_!=18))revert SettlementPending();
  return keccak256(abi.encode("LOCAL_ZERO_ALL_OBLIGATION_RELEASE_V1",block.chainid,address(core),funding,partialSettlement,p.attribution(),address(c),id,d.token,d.decimals_,policy.sid,fp,policy.basisHash));
 }
 function _zero(M.Fraction memory x) private pure {if(x.d==0||x.n!=0)revert SettlementPending();}
 function _position(uint256 pid,uint256 id,address who,Coordinator.Policy memory policy,bytes32 accountKey) private view returns(uint256 margin){
  IReleasePartial p=IReleasePartial(partialSettlement);Coordinator c=Coordinator(Funding(funding).collectionCoordinator());Attribution a=Attribution(p.attribution());
  Coordinator.Plan memory plan=c.plan(pid);Coordinator.SealedPlan memory seal=c.sealedPlan(pid);Partial.LinkedBasis memory b=p.linkedBasis(pid);
  (address owner,uint256[5] memory v,bytes32 fp)=core.coreExposureContext(pid);Partial.LinkedExit memory e=p.linkedExit(pid,b.sequence,true);
  (,bool closed_,bool gap)=Funding(funding).policyGap(id,policy.sid,who,pid);(uint256 released,uint256 releaseSeq,bytes32 completion)=p.releases(pid);
  if(owner!=who||v[0]!=id||v[1]!=policy.sid||v[3]+v[4]!=0||v[2]!=b.sequence||fp!=policy.fundingPolicy||b.initialSize==0||b.closed!=b.initialSize||b.held!=b.margin||e.status!=2||e.closed!=b.initialSize||e.timestamp!=policy.mock.exitTime||e.market!=policy.mock.exitMarket18||e.collateral!=policy.mock.exitCollateral18||e.marketTime!=e.timestamp||e.collateralTime!=e.timestamp||plan.id==bytes32(0)||plan.pid!=pid||plan.domain!=id||plan.accountKey!=accountKey||plan.sequence!=b.sequence||plan.plannedMargin!=b.margin||plan.firstEpoch!=1||plan.lastEpoch!=1||seal.settlementId==bytes32(0)||seal.planHash!=keccak256(abi.encode(plan))||!closed_||gap||p.linkedConsumed(pid)!=0||(released==0?(releaseSeq!=0||completion!=bytes32(0)):(released!=b.held||releaseSeq!=1||completion==bytes32(0)))||a.finalOrdinal(pid)==0||a.finalOrdinal(pid)==type(uint256).max)revert SettlementPending();
  _zero(plan.pnlGainRaw);_zero(plan.pnlLossRaw);_zero(plan.fundingDebtRaw);_zero(plan.fundingClaimRaw);_zero(plan.feesRaw);_zero(plan.fundingDebtUsd18);_zero(plan.fundingClaimUsd18);_zero(plan.pnlGainUsd27);_zero(plan.pnlLossUsd27);
  (,,M.Fraction memory debt,M.Fraction memory claim_)=a.positionEpoch(pid,1);_zero(debt);_zero(claim_);return b.margin;
 }
 function validateRelease(uint256 pid,address who) external view returns(Authorization memory result){
  if(msg.sender!=partialSettlement)revert Forbidden();(address owner,uint256[5] memory v,)=core.coreExposureContext(pid);uint256 id=v[0];if(owner!=who)revert Forbidden();(uint256 prior,uint256 priorSequence,bytes32 priorCompletion)=IReleasePartial(partialSettlement).releases(pid);if(prior!=0||priorSequence!=0||priorCompletion!=bytes32(0))revert SettlementPending();result.policyContext=context(id);if(generalReleasePolicy[id]!=bytes32(0))return _generalAuthorization(pid,who,id,result.policyContext);
  Funding f=Funding(funding);Coordinator c=Coordinator(f.collectionCoordinator());Coordinator.Policy memory policy=c.mockPolicy(id);IReleasePartial p=IReleasePartial(partialSettlement);Attribution a=Attribution(p.attribution());
  (uint256[11] memory e,int256 usdN,uint256 usdD)=f.fundingSeriesEpoch(id,policy.sid,1);uint256[8] memory m=f.fundingSeriesMember(id,policy.sid,1,who);
  Attribution.Total memory total=a.accountEpoch(id,who,1);_zero(total.debt);_zero(total.claim_);
  if(e[10]!=3||block.timestamp<e[1]||e[6]!=e[7]||e[3]!=e[8]||e[4]!=e[9]||usdN!=0||usdD==0||m[2]!=1||m[3]!=1||m[4]!=0||m[5]==0||m[6]!=0||m[7]==0||!total.done||total.le!=m[0]||total.se!=m[1])revert SettlementPending();
  bytes32 accountKey=keccak256(abi.encode(address(c),address(core),funding,partialSettlement,address(a),id,policy.sid,policy.fundingPolicy,who,policy.basisHash));
  (uint256 count,uint256 reserved,uint256 live,)=a.logs(a.accountKey(id,who));if(count==0||count>256||reserved!=0||live!=0)revert SettlementPending();uint256 opened;uint256 margin;bool seen;
  for(uint256 i=1;i<=count;i++){Attribution.Transition memory t=a.transition(id,who,i);if(t.oldL+t.oldS!=0)continue;if(t.sequence!=1||t.nextL+t.nextS==0)revert SettlementPending();margin+=_position(t.pid,id,who,policy,accountKey);opened++;if(t.pid==pid)seen=true;}
  Coordinator.AccountPlan memory aggregate=c.accountPlan(accountKey);if(!seen||aggregate.count!=opened||aggregate.plannedMargin!=margin)revert SettlementPending();_zero(aggregate.pnlGainRaw);_zero(aggregate.pnlLossRaw);_zero(aggregate.fundingDebtRaw);_zero(aggregate.fundingClaimRaw);_zero(aggregate.feesRaw);
  bytes32 epochKey=keccak256(abi.encode(address(c),id,policy.sid,uint256(1),policy.basisHash));(Funding.RepeatPayoutEpoch memory paid,,)=f.repeatPayoutState(id,bytes32(0),bytes32(0));if(f.repeatCash(epochKey)!=0||paid.paid!=0||paid.reserved!=0||paid.started||f.repeatAccountCollected(keccak256(abi.encode(accountKey,uint256(1))))!=0)revert SettlementPending();
  Partial.LinkedBasis memory b=p.linkedBasis(pid);Coordinator.SealedPlan memory seal=c.sealedPlan(pid);result.account=who;result.domain=id;result.pid=pid;result.finalSequence=b.sequence;result.amount=b.held;
  result.completion=keccak256(abi.encode("V11_ZERO_OBLIGATION_COMPLETION",block.chainid,address(core),funding,partialSettlement,id,who,pid,b.key,b.sequence,policy.sid,result.policyContext,policy.basisHash,seal.settlementId,seal.planHash,epochKey,b.held));
 }
 // General policy is opt-in before use. Partial remains the only release ledger.
 address public settlementCompletionVerifier;
 bytes32 public settlementCompletionVerifierCodeHash;
 mapping(uint256=>bytes32) public generalReleasePolicy;
 event SettlementCompletionBound(address indexed verifier,bytes32 codeHash);
 event GeneralReleaseConfigured(uint256 indexed domain,bytes32 context);
 function _completionModule() private view returns(Completion module_){
  module_=Completion(settlementCompletionVerifier);IGeneralReleasePartial p=IGeneralReleasePartial(partialSettlement);Funding f=Funding(funding);
  if(block.chainid!=31337||address(module_).code.length==0||address(module_).codehash!=settlementCompletionVerifierCodeHash||core.localPartial()!=partialSettlement||core.localFunding()!=funding||p.core()!=address(core)||p.funding()!=funding||p.releaseVerifier()!=address(this)||p.releaseVerifierCodeHash()!=address(this).codehash||address(module_.core())!=address(core)||module_.funding()!=funding||module_.partialSettlement()!=partialSettlement||module_.attribution()!=p.attribution()||module_.coordinator()!=f.collectionCoordinator()||module_.collectionExecutor()!=f.collectionExecutor())revert SettlementPending();
  if(module_.peerCodeHash()!=keccak256(abi.encode(address(core).codehash,funding.codehash,partialSettlement.codehash,p.attribution().codehash,f.collectionCoordinator().codehash,f.collectionExecutor().codehash)))revert SettlementPending();
 }
 function bindSettlementCompletion(address module_,bytes32 approvedCodeHash) external {
  if(address(core.domainRegistry())!=address(0)||msg.sender!=core.governance()||settlementCompletionVerifier!=address(0)||module_.code.length==0||approvedCodeHash==bytes32(0)||module_.codehash!=approvedCodeHash)revert Forbidden();
  settlementCompletionVerifier=module_;settlementCompletionVerifierCodeHash=approvedCodeHash;_completionModule();emit SettlementCompletionBound(module_,approvedCodeHash);
 }
 function _generalPolicy(uint256 id) private view returns(bytes32 stable,bytes32 evidencePolicy){
  Completion module_=_completionModule();Coordinator c=Coordinator(Funding(funding).collectionCoordinator());Coordinator.Policy memory policy=c.mockPolicy(id);Core.Domain memory d=core.domain(id);(uint256[11] memory series,bytes32 fp)=Funding(funding).fundingSeries(id,policy.sid);
  if(d.state!=Core.State.Normal||(d.decimals_!=6&&d.decimals_!=18)||policy.sid==0||policy.epochs!=1||series[0]!=policy.origin||series[1]!=policy.duration||series[2]!=1||series[5]>1||fp!=policy.fundingPolicy||fp!=d.cfg.policyDigest||policy.mock.calculationPolicy!=c.CALCULATION_POLICY()||policy.mock.observationTag==bytes32(0)||policy.basisHash==bytes32(0))revert SettlementPending();
  evidencePolicy=keccak256(abi.encode("GENERAL_COMPLETION_EVIDENCE_NOT_AUTHORIZATION",block.chainid,address(module_),address(core),funding,partialSettlement,module_.attribution(),address(c),module_.collectionExecutor(),module_.collectionExecutor().codehash,d.token,d.decimals_,id,policy));
  stable=keccak256(abi.encode("GENERAL_HELD_RELEASE_POLICY_V1",block.chainid,address(this),address(module_),settlementCompletionVerifierCodeHash,evidencePolicy));
  if(address(core.domainRegistry())!=address(0))IGeneralReleaseRegistry(address(core.domainRegistry())).assertGeneralRelease(id,this.context.selector,stable);
 }
 function configureGeneralRelease(uint256 id) external {
  Core.Domain memory d=core.domain(id);IGeneralReleasePartial p=IGeneralReleasePartial(partialSettlement);Funding f=Funding(funding);Coordinator c=Coordinator(f.collectionCoordinator());Coordinator.Policy memory policy=c.mockPolicy(id);
  if(msg.sender!=d.governor)revert Forbidden();
  if(id<=p.legacyDomainCutoff()||generalReleasePolicy[id]!=bytes32(0)||p.heldReleasePolicy(id)!=bytes32(0)||p.researchTouched(id)||p.lpEnabled(id)||block.timestamp>=policy.origin||d.accounted!=0||d.oi!=0||d.active!=0||d.unprocessed!=0||p.linkedHeld(id)!=0||p.linkedPending(id)!=0||p.linkedFinalReserved(id)!=0)revert SettlementPending();
  uint256[12] memory pool=p.partialPool(id);for(uint256 i;i<12;i++)if(pool[i]!=0)revert SettlementPending();
  (uint256[11] memory series,)=f.fundingSeries(id,policy.sid);if(series[6]!=1||series[7]!=policy.origin||series[8]+series[9]+series[10]!=0)revert SettlementPending();
  bytes32 epochKey=keccak256(abi.encode(address(c),id,policy.sid,uint256(1),policy.basisHash));(Funding.RepeatPayoutEpoch memory paid,,)=f.repeatPayoutState(id,bytes32(0),bytes32(0));(,uint256 protectedAmount,)=p.repeatReceiptState(id,bytes32(0),bytes32(0));if(f.repeatCash(epochKey)!=0||paid.paid!=0||paid.reserved!=0||paid.started||protectedAmount!=0)revert SettlementPending();
  (bytes32 stable,)=_generalPolicy(id);if(address(core.domainRegistry())!=address(0))IGeneralReleaseRegistry(address(core.domainRegistry())).assertGeneralRelease(id,this.configureGeneralRelease.selector,stable);generalReleasePolicy[id]=stable;emit GeneralReleaseConfigured(id,stable);
 }
 function _generalAuthorization(uint256 pid,address who,uint256 id,bytes32 stable) private view returns(Authorization memory result){
  if(address(core.domainRegistry())!=address(0))IGeneralReleaseRegistry(address(core.domainRegistry())).assertGeneralRelease(id,this.validateRelease.selector,stable);
  Completion module_=_completionModule();Completion.CompletionEvidence memory e=module_.completionEvidence(pid,who);(bytes32 current,bytes32 evidencePolicy)=_generalPolicy(id);
  IReleasePartial p=IReleasePartial(partialSettlement);Partial.LinkedBasis memory b=p.linkedBasis(pid);(address owner,uint256[5] memory v,)=core.coreExposureContext(pid);
  Coordinator c=Coordinator(module_.coordinator());Coordinator.AccountPlan memory aggregate=c.accountPlan(e.accountKey);
  if(stable!=current||stable!=generalReleasePolicy[id]||!e.complete||e.blockers!=0||e.commitment==bytes32(0)||e.policyContext!=evidencePolicy||e.account!=who||owner!=who||e.domain!=id||e.position.pid!=pid||e.position.finalSequence!=v[2]||v[2]!=b.sequence||v[3]+v[4]!=0||b.closed!=b.initialSize||aggregate.count!=1||e.position.held!=b.held||e.position.consumed!=p.linkedConsumed(pid)||e.position.released!=0||e.position.remaining==0||e.position.remaining!=b.held-p.linkedConsumed(pid))revert SettlementPending();
  result.account=who;result.domain=id;result.pid=pid;result.finalSequence=b.sequence;result.amount=e.position.remaining;result.policyContext=stable;
  result.completion=keccak256(abi.encode("GENERAL_HELD_RELEASE_AUTH_V1",block.chainid,address(this),address(module_),settlementCompletionVerifierCodeHash,address(core),funding,partialSettlement,id,who,pid,b.key,b.sequence,uint256(1),stable,e.commitment,result.amount));
 }
}
