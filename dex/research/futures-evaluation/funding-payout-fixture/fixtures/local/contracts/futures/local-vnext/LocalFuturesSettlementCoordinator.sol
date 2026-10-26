// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore} from "./LocalFuturesCore.sol";
import {LocalFuturesFunding,IRepeatCollectionQuote} from "./LocalFuturesFunding.sol";
import {LocalFuturesPartialSettlement} from "./LocalFuturesPartialSettlement.sol";
import {LocalFuturesAttribution} from "./LocalFuturesAttribution.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
/// @notice LOCAL MOCK calculation records ONLY. No custody, token calls, payments,
/// releases, LP permissions, production Oracle conversion or settlement execution.
interface ICoordinatorPreparationRegistry {function cutoff() external view returns(uint256);function assertCoordinatorPreparation(uint256,bytes32) external view;}
contract LocalFuturesSettlementCoordinator {
 LocalFuturesCore public immutable core;
 LocalFuturesFunding public immutable funding;
 LocalFuturesPartialSettlement public immutable partialSettlement;
 LocalFuturesAttribution public immutable attribution;
 bytes32 public constant CALCULATION_POLICY=keccak256("LOCAL_MOCK_GROSS_PLAN_V1");
 uint256 private entered;
 error Forbidden();error Invalid();error Pending();error Duplicate();error Mismatch();
 modifier lock(){if(entered!=0)revert Forbidden();entered=1;_;entered=0;}
 struct MockInput {uint256 fundingPrice18;uint256 exitMarket18;uint256 exitCollateral18;uint256 exitTime;bytes32 observationTag;bytes32 calculationPolicy;}
 struct Policy {uint256 sid;bytes32 fundingPolicy;uint256 origin;uint256 duration;uint256 epochs;MockInput mock;bytes32 basisHash;}
 struct Usage {M.Fraction debtUsd18;M.Fraction claimUsd18;}
 struct AccountPlan {uint256 plannedMargin;M.Fraction pnlGainRaw;M.Fraction pnlLossRaw;M.Fraction fundingDebtRaw;M.Fraction fundingClaimRaw;M.Fraction feesRaw;uint256 count;}
 struct Plan {bytes32 id;bytes32 accountKey;uint256 domain;uint256 pid;uint256 sequence;uint256 firstEpoch;uint256 lastEpoch;uint256 plannedMargin;M.Fraction fundingDebtUsd18;M.Fraction fundingClaimUsd18;M.Fraction pnlGainUsd27;M.Fraction pnlLossUsd27;M.Fraction pnlGainRaw;M.Fraction pnlLossRaw;M.Fraction fundingDebtRaw;M.Fraction fundingClaimRaw;M.Fraction feesRaw;}
 struct Allocation {uint256 plannedMargin;uint256 pnlDebtCeil;uint256 fundingDebtCeil;uint256 feeCeil;uint256 plannedPnl;uint256 plannedFunding;uint256 allocationReserve;uint256 plannedFee;uint256 unassignedMargin;uint256 pnlShortage;uint256 fundingShortage;uint256 feeShortage;uint256 pnlGainFloor;uint256 fundingClaimFloor;uint256 pnlFractionBuffer;uint256 fundingFractionBuffer;bool fractionsPending;}
 // Research specifications only: no reported budget proves token receipt.
 struct SealedPlan {bytes32 settlementId;bytes32 planHash;bytes32 epochRoot;uint256 limit;uint256 budget;uint256 step;Allocation cumulative;}
 event PlanSealed(uint256 indexed pid,bytes32 indexed settlementId,bytes32 epochRoot,uint256 limit);
 event BudgetSpecified(uint256 indexed pid,uint256 step,uint256 budget,uint256 pnlDelta,uint256 fundingDelta,uint256 feeDelta,uint256 roundingReserve);
 mapping(uint256=>Policy) private policies;
 mapping(uint256=>Plan) private plans;
 mapping(bytes32=>mapping(uint256=>Usage)) private usage;
 mapping(bytes32=>AccountPlan) private accountPlans;
 mapping(uint256=>SealedPlan) private sealedPlans;
 mapping(uint256=>mapping(uint256=>Usage)) private sealedEpochs;

 // SPECIFICATION ONLY. Model allocations never establish receipt or custody.
 struct IntegerSpecification {bytes32 id;bytes32 sealedId;bytes32 planHash;bytes32 accountKey;uint256 epoch;uint256 calculationStep;uint256 specificationSequence;uint256 expectedActualExecutionSequence;uint256 budget;uint256 pnlTarget;uint256 fundingTarget;uint256 feeTarget;uint256 accountDebtLimit;uint256 positionDebtLimit;uint256 fundingDelta;bool actualReceiptConfirmed;}
 mapping(bytes32=>IntegerSpecification) private integerSpecifications;
 mapping(uint256=>bytes32) public latestIntegerSpecification;
 mapping(bytes32=>mapping(uint256=>uint256)) public modeledAccountFunding;
 event IntegerSpecificationRecorded(bytes32 indexed id,uint256 indexed pid,uint256 specificationSequence,uint256 fundingTarget);
 event MockPolicyFixed(uint256 indexed domain,bytes32 indexed basisHash);
 event CalculationRecorded(bytes32 indexed settlementId,uint256 indexed positionId,bytes32 indexed accountKey);
 constructor(address partial_) {
  if(block.chainid!=31337||partial_.code.length==0)revert Forbidden();partialSettlement=LocalFuturesPartialSettlement(partial_);
  core=partialSettlement.core();funding=LocalFuturesFunding(partialSettlement.funding());attribution=LocalFuturesAttribution(partialSettlement.attribution());
  if(address(attribution).code.length==0||core.localPartial()!=partial_||core.localFunding()!=address(funding)||address(attribution.core())!=address(core)||attribution.funding()!=address(funding)||attribution.partialSettlement()!=partial_||address(funding.core())!=address(core))revert Forbidden();
 }
 function productionEnabled() external pure returns(bool){return false;}
 function registerMockPolicy(uint256 id,MockInput calldata input) external lock {
  LocalFuturesCore.Domain memory d=core.domain(id);
  (uint256 sid,bytes32 policy,uint256 origin,uint256 duration,uint256 epochs,,)=attribution.config(id);
  if(msg.sender!=d.governor||policies[id].sid!=0||sid==0||d.state!=LocalFuturesCore.State.Normal||partialSettlement.researchTouched(id)||block.timestamp>=origin||input.calculationPolicy!=CALCULATION_POLICY||input.observationTag==bytes32(0))revert Forbidden();
  if(input.fundingPrice18==0||input.fundingPrice18>1e24||input.exitMarket18==0||input.exitMarket18>1e24||input.exitCollateral18==0||input.exitCollateral18>1e24||input.exitTime<origin||input.exitTime>origin+duration*epochs)revert Invalid();
  (uint256 bound,bytes32 bp,uint256 l,uint256 s)=core.exposureBindings(id);
  if(bound!=sid||bp!=policy||policy!=d.cfg.policyDigest||l+s!=0||partialSettlement.linkedCapacity(id)==0)revert Mismatch();
  bytes32 hash=keccak256(abi.encode("LOCAL_MOCK_ONLY",block.chainid,address(this),address(core),address(funding),address(partialSettlement),address(attribution),id,d.token,d.decimals_,sid,policy,origin,duration,epochs,input));
  address registry=address(core.domainRegistry());if(registry!=address(0)&&id>ICoordinatorPreparationRegistry(registry).cutoff())ICoordinatorPreparationRegistry(registry).assertCoordinatorPreparation(id,keccak256(abi.encode(input)));
  policies[id]=Policy(sid,policy,origin,duration,epochs,input,hash);emit MockPolicyFixed(id,hash);
 }
 function _z(M.Fraction memory f) private pure returns(M.Fraction memory){return f.d==0?M.fraction(0,1):f;}
 function _add(M.Fraction storage target,M.Fraction memory value) private {M.Fraction memory sum=M.addFraction(_z(target),value);target.n=sum.n;target.d=sum.d;}
 function _within(M.Fraction memory a,M.Fraction memory b) private pure {if(M.addFraction(a,M.fraction(-b.n,b.d)).n>0)revert Mismatch();}
 function _convert(M.Fraction memory usd,uint256 price,uint8 decimals_) private pure returns(M.Fraction memory){return M.scaleFraction(usd,10**decimals_,price);}
 function _pnl(uint256 pid,bool long_,Policy storage policy,LocalFuturesPartialSettlement.LinkedBasis memory b,Plan memory plan) private view returns(Plan memory){
  uint256 previous;M.Fraction memory gain=M.fraction(0,1);M.Fraction memory loss=M.fraction(0,1);
  for(uint256 seq=2;seq<=b.sequence;seq++){
   bool final_=seq==b.sequence;LocalFuturesPartialSettlement.LinkedExit memory e=partialSettlement.linkedExit(pid,seq,final_);
   if(e.status!=(final_?2:3)||e.closed<=previous||e.closed>b.initialSize||e.timestamp!=policy.mock.exitTime||e.market!=policy.mock.exitMarket18||e.collateral!=policy.mock.exitCollateral18||e.marketTime!=e.timestamp||e.collateralTime!=e.timestamp||e.cutoff!=policy.origin+policy.duration*policy.epochs)revert Mismatch();
   uint256 oldSize=b.initialSize-previous;uint256 next=b.initialSize-e.closed;
   bytes32 receipt=keccak256(abi.encode(b.key,seq,e.timestamp,long_?oldSize:0,long_?0:oldSize,long_?next:0,long_?0:next));
   if(e.receipt!=receipt)revert Mismatch();
   int256 delta=int256(e.market)-int256(b.entry);if(!long_)delta=-delta;
   M.Fraction memory leg=M.scaleFraction(M.fraction(delta,b.entry),(e.closed-previous)*1e9,1);
   if(leg.n>=0)gain=M.addFraction(gain,leg);else loss=M.addFraction(loss,M.fraction(-leg.n,leg.d));previous=e.closed;
  }
  if(previous!=b.initialSize)revert Mismatch();plan.pnlGainUsd27=gain;plan.pnlLossUsd27=loss;
  uint8 dec=core.domain(plan.domain).decimals_;
  plan.pnlGainRaw=_convert(gain,policy.mock.exitCollateral18*1e9,dec);plan.pnlLossRaw=_convert(loss,policy.mock.exitCollateral18*1e9,dec);return plan;
 }
 function recordPlan(uint256 pid) external lock returns(bytes32 settlementId){
  if(plans[pid].id!=bytes32(0))revert Duplicate();
  (bytes32 key,address who,uint256 id,uint256 sid,uint256 opened,uint256 closedAt,uint256 size,uint256 seq,bool long_)=attribution.traces(pid);
  Policy storage policy=policies[id];LocalFuturesCore.Domain memory d=core.domain(id);
  (address owner,uint256[5] memory v,bytes32 fp)=core.coreExposureContext(pid);
  LocalFuturesPartialSettlement.LinkedBasis memory b=partialSettlement.linkedBasis(pid);
  if(policy.sid==0||size!=0||seq<2||closedAt<opened||closedAt!=policy.mock.exitTime||sid!=policy.sid||owner!=who||v[0]!=id||v[1]!=sid||v[2]!=seq||v[3]+v[4]!=0||fp!=policy.fundingPolicy||d.cfg.policyDigest!=fp||d.state!=LocalFuturesCore.State.Normal||key!=b.key||b.closed!=b.initialSize||b.held!=b.margin||b.sequence!=seq||b.partials>d.cfg.maxBatch||seq!=b.partials+2||funding.coreExposureSequences(key)!=seq)revert Pending();
  (,bool gapClosed,bool gapUnresolved)=funding.policyGap(id,sid,who,pid);
  if(!gapClosed||gapUnresolved||closedAt>policy.origin+policy.duration*policy.epochs)revert Pending();
  Plan memory plan;plan.domain=id;plan.pid=pid;plan.sequence=seq;plan.plannedMargin=b.margin;
  plan.firstEpoch=(opened-policy.origin)/policy.duration+1;
  plan.lastEpoch=closedAt<=opened?plan.firstEpoch:(closedAt-1-policy.origin)/policy.duration+1;
  if(plan.lastEpoch<plan.firstEpoch)plan.lastEpoch=plan.firstEpoch;
  if(plan.lastEpoch>policy.epochs||plan.lastEpoch-plan.firstEpoch+1>d.cfg.maxBatch)revert Pending();
  plan.accountKey=keccak256(abi.encode(address(this),address(core),address(funding),address(partialSettlement),address(attribution),id,sid,fp,who,policy.basisHash));
  plan.fundingDebtUsd18=M.fraction(0,1);plan.fundingClaimUsd18=M.fraction(0,1);
  for(uint256 epoch=plan.firstEpoch;epoch<=plan.lastEpoch;epoch++){
   (uint256[11] memory e,,)=funding.fundingSeriesEpoch(id,sid,epoch);if(e[10]!=3||e[6]!=e[7])revert Pending();
   LocalFuturesAttribution.Total memory total=attribution.accountEpoch(id,who,epoch);if(!total.done)revert Pending();
   (,,M.Fraction memory debt,M.Fraction memory claim_)=attribution.positionEpoch(pid,epoch);
   uint256[8] memory member=funding.fundingSeriesMember(id,sid,epoch,who);
   if(member[3]!=1)revert Pending();
   Usage storage u=usage[plan.accountKey][epoch];_add(u.debtUsd18,debt);_add(u.claimUsd18,claim_);
   _within(u.debtUsd18,M.fraction(M.signed(member[4],false),member[5]));_within(u.claimUsd18,M.fraction(M.signed(member[6],false),member[7]));
   plan.fundingDebtUsd18=M.addFraction(plan.fundingDebtUsd18,debt);plan.fundingClaimUsd18=M.addFraction(plan.fundingClaimUsd18,claim_);
  }
  plan.fundingDebtRaw=_convert(plan.fundingDebtUsd18,policy.mock.fundingPrice18,d.decimals_);plan.fundingClaimRaw=_convert(plan.fundingClaimUsd18,policy.mock.fundingPrice18,d.decimals_);
  plan=_pnl(pid,long_,policy,b,plan);plan.feesRaw=_convert(M.fraction(M.signed(b.initialSize*d.cfg.feeBps,false),10000),policy.mock.exitCollateral18,d.decimals_);
  settlementId=keccak256(abi.encode("REPEATING_PLAN_ONLY",block.chainid,address(this),address(core),address(funding),address(partialSettlement),address(attribution),id,d.token,d.decimals_,sid,fp,who,pid,seq,plan.firstEpoch,plan.lastEpoch,policy.basisHash,key));plan.id=settlementId;
  AccountPlan storage account=accountPlans[plan.accountKey];account.plannedMargin+=b.margin;account.count++;
  _add(account.pnlGainRaw,plan.pnlGainRaw);_add(account.pnlLossRaw,plan.pnlLossRaw);_add(account.fundingDebtRaw,plan.fundingDebtRaw);_add(account.fundingClaimRaw,plan.fundingClaimRaw);_add(account.feesRaw,plan.feesRaw);
  plans[pid]=plan;emit CalculationRecorded(settlementId,pid,plan.accountKey);
 }
 function _floor(M.Fraction memory f) private pure returns(uint256){f=_z(f);return uint256(f.n)/f.d;}
 function _ceil(M.Fraction memory f) private pure returns(uint256){f=_z(f);return uint256(f.n)/f.d+(uint256(f.n)%f.d==0?0:1);}
 function _rem(M.Fraction memory f) private pure returns(bool){f=_z(f);return uint256(f.n)%f.d!=0;}
 function allocation(bytes32 accountKey_) external view returns(Allocation memory a){
  return _allocate(accountPlans[accountKey_],accountPlans[accountKey_].plannedMargin);
 }
 function _allocate(AccountPlan memory p,uint256 budget) private pure returns(Allocation memory a){
  a.plannedMargin=budget;a.pnlDebtCeil=_ceil(p.pnlLossRaw);a.fundingDebtCeil=_ceil(p.fundingDebtRaw);a.feeCeil=_ceil(p.feesRaw);
  uint256 total=a.pnlDebtCeil+a.fundingDebtCeil;uint256 used=total<budget?total:budget;
  (a.plannedPnl,a.plannedFunding,a.allocationReserve)=M.proportionalFunding(used,a.pnlDebtCeil,a.fundingDebtCeil);
  uint256 left=budget-used;if(used==total)a.plannedFee=left<a.feeCeil?left:a.feeCeil;
  a.unassignedMargin=left-a.plannedFee;a.pnlShortage=a.pnlDebtCeil-a.plannedPnl;a.fundingShortage=a.fundingDebtCeil-a.plannedFunding;a.feeShortage=a.feeCeil-a.plannedFee;
  a.pnlGainFloor=_floor(p.pnlGainRaw);a.fundingClaimFloor=_floor(p.fundingClaimRaw);
  uint256 pr=a.pnlDebtCeil-_floor(p.pnlLossRaw);a.pnlFractionBuffer=pr<a.plannedPnl?pr:a.plannedPnl;
  uint256 fr=a.fundingDebtCeil-_floor(p.fundingDebtRaw);a.fundingFractionBuffer=fr<a.plannedFunding?fr:a.plannedFunding;
  a.fractionsPending=_rem(p.pnlGainRaw)||_rem(p.pnlLossRaw)||_rem(p.fundingDebtRaw)||_rem(p.fundingClaimRaw)||_rem(p.feesRaw);
 }

 // Single-position seals deliberately do not pool another position's collateral.
 function _owner(uint256 pid) private view {
  (address who,,)=core.coreExposureContext(pid);if(msg.sender!=who)revert Forbidden();
 }
 function sealPlan(uint256 pid,bytes32 expectedPlanId) external lock returns(bytes32){
  _owner(pid);Plan storage p=plans[pid];SealedPlan storage z=sealedPlans[pid];
  if(p.id==bytes32(0)||p.id!=expectedPlanId)revert Pending();if(z.settlementId!=bytes32(0))revert Duplicate();
  LocalFuturesPartialSettlement.LinkedBasis memory b=partialSettlement.linkedBasis(pid);
  if(b.sequence!=p.sequence||b.closed!=b.initialSize||b.held!=p.plannedMargin)revert Mismatch();
  (,,bool unresolved)=funding.policyGap(p.domain,policies[p.domain].sid,_positionOwner(pid),pid);if(unresolved)revert Pending();
  M.Fraction memory debt=M.fraction(0,1);M.Fraction memory claim_=M.fraction(0,1);bytes32 root;
  for(uint256 e=p.firstEpoch;e<=p.lastEpoch;e++){
   (,,M.Fraction memory d,M.Fraction memory c)=attribution.positionEpoch(pid,e);
   sealedEpochs[pid][e]=Usage(d,c);debt=M.addFraction(debt,d);claim_=M.addFraction(claim_,c);
   root=keccak256(abi.encode(root,e,d,c));
  }
  if(keccak256(abi.encode(debt,claim_))!=keccak256(abi.encode(p.fundingDebtUsd18,p.fundingClaimUsd18)))revert Mismatch();
  z.planHash=keccak256(abi.encode(p));z.epochRoot=root;z.limit=p.plannedMargin;
  z.settlementId=keccak256(abi.encode("REPEATING_SEALED_SPEC_ONLY",p.id,z.planHash,root,z.limit));
  z.cumulative=_positionAllocation(p,0);emit PlanSealed(pid,z.settlementId,root,z.limit);return z.settlementId;
 }
 function _positionOwner(uint256 pid) private view returns(address who){(who,,)=core.coreExposureContext(pid);}
 function _positionAllocation(Plan storage p,uint256 budget) private view returns(Allocation memory){
  AccountPlan memory a=AccountPlan(p.plannedMargin,p.pnlGainRaw,p.pnlLossRaw,p.fundingDebtRaw,p.fundingClaimRaw,p.feesRaw,1);
  return _allocate(a,budget);
 }
 // Cumulative mock budget <= this position's held margin. Not a cash ledger,
 // receipt, payment authorization or claim. Reserve is a cumulative subset;
 // it can fall as subsequent budget turns earlier rounding into allocations.
 function specifyCumulativeBudget(uint256 pid,bytes32 settlementId,uint256 expectedStep,uint256 budget) external lock {
  _owner(pid);SealedPlan storage z=sealedPlans[pid];Plan storage p=plans[pid];
  if(z.settlementId==bytes32(0)||settlementId!=z.settlementId)revert Mismatch();
  if(expectedStep!=z.step+1||budget<=z.budget||budget>z.limit)revert Invalid();
  if(keccak256(abi.encode(p))!=z.planHash)revert Mismatch();
  Allocation memory a=_positionAllocation(p,budget);
  uint256 dp=a.plannedPnl-z.cumulative.plannedPnl;uint256 df=a.plannedFunding-z.cumulative.plannedFunding;uint256 fee=a.plannedFee-z.cumulative.plannedFee;
  z.budget=budget;z.step=expectedStep;z.cumulative=a;
  emit BudgetSpecified(pid,expectedStep,budget,dp,df,fee,a.allocationReserve);
 }
 function sealedPlan(uint256 pid) external view returns(SealedPlan memory){return sealedPlans[pid];}
 function sealedEpoch(uint256 pid,uint256 epoch) external view returns(Usage memory usd,M.Fraction memory debtRaw,M.Fraction memory claimRaw){
  Plan storage p=plans[pid];if(sealedPlans[pid].settlementId==bytes32(0)||epoch<p.firstEpoch||epoch>p.lastEpoch)revert Invalid();
  usd=sealedEpochs[pid][epoch];Policy storage policy=policies[p.domain];uint8 dec=core.domain(p.domain).decimals_;
  debtRaw=_convert(usd.debtUsd18,policy.mock.fundingPrice18,dec);claimRaw=_convert(usd.claimUsd18,policy.mock.fundingPrice18,dec);
 }

 function _integer(M.Fraction memory f) private pure returns(uint256){
  if(f.d==0||f.n<0||uint256(f.n)%f.d!=0)revert Pending();return uint256(f.n)/f.d;
 }
 function _integerLimits(uint256 pid,Plan storage p,SealedPlan storage z) private view returns(uint256 accountLimit,uint256 positionLimit){
  Policy storage policy=policies[p.domain];LocalFuturesCore.Domain memory d=core.domain(p.domain);
  (address who,uint256[5] memory v,bytes32 fp)=core.coreExposureContext(pid);
  if(p.firstEpoch!=p.lastEpoch||v[0]!=p.domain||v[1]!=policy.sid||v[2]!=p.sequence||v[3]+v[4]!=0||fp!=policy.fundingPolicy||fp!=d.cfg.policyDigest||d.state!=LocalFuturesCore.State.Normal||policy.mock.calculationPolicy!=CALCULATION_POLICY||z.planHash!=keccak256(abi.encode(p)))revert Pending();
  LocalFuturesPartialSettlement.LinkedBasis memory b=partialSettlement.linkedBasis(pid);
  if(b.sequence!=p.sequence||b.closed!=b.initialSize||b.held!=z.limit||b.margin!=z.limit||funding.coreExposureSequences(b.key)!=p.sequence)revert Mismatch();
  (,bool closed_,bool unresolved)=funding.policyGap(p.domain,policy.sid,who,pid);if(!closed_||unresolved)revert Pending();
  (uint256[11] memory e,,)=funding.fundingSeriesEpoch(p.domain,policy.sid,p.firstEpoch);if(e[10]!=3||e[6]!=e[7])revert Pending();
  uint256[8] memory m=funding.fundingSeriesMember(p.domain,policy.sid,p.firstEpoch,who);if(m[3]!=1)revert Pending();
  accountLimit=_integer(_convert(M.fraction(M.signed(m[4],false),m[5]),policy.mock.fundingPrice18,d.decimals_));
  _integer(_convert(M.fraction(M.signed(m[6],false),m[7]),policy.mock.fundingPrice18,d.decimals_));
  Usage storage u=sealedEpochs[pid][p.firstEpoch];
  if(z.epochRoot!=keccak256(abi.encode(bytes32(0),p.firstEpoch,u.debtUsd18,u.claimUsd18))||keccak256(abi.encode(u.debtUsd18,u.claimUsd18))!=keccak256(abi.encode(p.fundingDebtUsd18,p.fundingClaimUsd18)))revert Mismatch();
  positionLimit=_integer(p.fundingDebtRaw);_integer(p.fundingClaimRaw);_integer(p.pnlGainRaw);_integer(p.pnlLossRaw);_integer(p.feesRaw);
  if(positionLimit>accountLimit||z.cumulative.fractionsPending||z.cumulative.allocationReserve!=0)revert Pending();
 }
 // Future custody execution MUST independently revalidate live state and balances.
 // expectedActualExecutionSequence remains zero: this module has no receipt API.
 function recordIntegerSpecification(uint256 pid,bytes32 sealedId,uint256 expectedSequence,uint256 expectedAccountTarget) external lock returns(bytes32 id){
  _owner(pid);Plan storage p=plans[pid];SealedPlan storage z=sealedPlans[pid];
  if(z.settlementId==bytes32(0)||z.settlementId!=sealedId||z.step==0)revert Pending();
  IntegerSpecification storage old=integerSpecifications[latestIntegerSpecification[pid]];
  if(expectedSequence!=old.specificationSequence+1||z.step<=old.calculationStep||z.budget<=old.budget)revert Duplicate();
  (uint256 accountLimit,uint256 positionLimit)=_integerLimits(pid,p,z);
  Allocation memory a=_positionAllocation(p,z.budget);
  if(keccak256(abi.encode(a))!=keccak256(abi.encode(z.cumulative))||a.plannedFunding>positionLimit)revert Mismatch();
  uint256 previous=modeledAccountFunding[p.accountKey][p.firstEpoch];if(previous!=expectedAccountTarget)revert Mismatch();
  uint256 delta=a.plannedFunding-old.fundingTarget;uint256 target=previous+delta;if(target>accountLimit)revert Invalid();
  id=keccak256(abi.encode("INTEGER_SPECIFICATION_NOT_RECEIPT",z.settlementId,z.planHash,z.epochRoot,p.accountKey,p.firstEpoch,z.step,expectedSequence,z.budget,a.plannedPnl,a.plannedFunding,a.plannedFee,accountLimit,positionLimit,previous));
  if(integerSpecifications[id].id!=bytes32(0))revert Duplicate();
  integerSpecifications[id]=IntegerSpecification(id,sealedId,z.planHash,p.accountKey,p.firstEpoch,z.step,expectedSequence,0,z.budget,a.plannedPnl,a.plannedFunding,a.plannedFee,accountLimit,positionLimit,delta,false);
  latestIntegerSpecification[pid]=id;modeledAccountFunding[p.accountKey][p.firstEpoch]=target;
  emit IntegerSpecificationRecorded(id,pid,expectedSequence,a.plannedFunding);
 }
 function integerSpecification(bytes32 id) external view returns(IntegerSpecification memory){return integerSpecifications[id];}

 // Narrow live verification ABI. This view never confirms a token receipt.
 function collectionQuote(uint256 pid,bytes32 specification) external view returns(IRepeatCollectionQuote.Quote memory q){
  if(funding.collectionCoordinator()!=address(this)||specification==bytes32(0)||latestIntegerSpecification[pid]!=specification)revert Forbidden();
  IntegerSpecification storage v=integerSpecifications[specification];Plan storage p=plans[pid];SealedPlan storage z=sealedPlans[pid];
  if(v.planHash!=z.planHash||v.sealedId!=z.settlementId||v.calculationStep!=z.step||v.budget!=z.budget)revert Pending();
  (q.accountLimit,q.positionLimit)=_integerLimits(pid,p,z);
  q.positionKey=keccak256(abi.encode(address(core),address(funding),address(partialSettlement),address(this),z.settlementId));
  q.accountKey=keccak256(abi.encode(p.accountKey,p.firstEpoch));q.epochKey=keccak256(abi.encode(address(this),p.domain,policies[p.domain].sid,p.firstEpoch,policies[p.domain].basisHash));
  q.owner=_positionOwner(pid);q.domain=p.domain;q.budget=v.budget;q.pnl=v.pnlTarget;q.funding=v.fundingTarget;q.fee=v.feeTarget;
 }
 function mockPolicy(uint256 id) external view returns(Policy memory){return policies[id];}
 function plan(uint256 pid) external view returns(Plan memory){return plans[pid];}
 function accountPlan(bytes32 key) external view returns(AccountPlan memory){return accountPlans[key];}
 function accountUsage(bytes32 key,uint256 epoch) external view returns(Usage memory){return usage[key][epoch];}
}
