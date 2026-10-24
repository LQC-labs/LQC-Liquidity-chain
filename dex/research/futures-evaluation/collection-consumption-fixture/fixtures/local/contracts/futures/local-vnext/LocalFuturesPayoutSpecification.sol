// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesSettlementCoordinator as Coordinator} from "./LocalFuturesSettlementCoordinator.sol";
import {LocalFuturesCore as Core} from "./LocalFuturesCore.sol";
import {LocalFuturesFunding as Funding} from "./LocalFuturesFunding.sol";
import {LocalFuturesPartialSettlement as Partial} from "./LocalFuturesPartialSettlement.sol";
import {LocalFuturesAttribution as Attribution} from "./LocalFuturesAttribution.sol";
import {SettlementMath as M} from "./SettlementMath.sol";

/// @notice LOCAL calculation evidence only. No custody or payment authority.
contract LocalFuturesPayoutSpecification {
 Coordinator public immutable coordinator;
 Core public immutable core;
 Funding public immutable funding;
 Partial public immutable partialSettlement;
 Attribution public immutable attribution;
 enum PaymentConnection { NotConnected }
 struct Epoch {
  bytes32 basis; bytes32 epochKey; bytes32 rightsRoot;
  uint256 sid; uint256 batch; uint256 participants; uint256 verified;
  uint256 le; uint256 se; uint256 debt; uint256 claims; uint256 denominator;
  uint256 modeledTotal; bool sealed_;
 }
 struct Member {bool verified; uint256 claim; uint256 modeled; uint256 sequence; uint256 cashSnapshot; bytes32 latest;}
 struct Specification {bytes32 epochKey;address account;uint256 sequence;uint256 collected;uint256 cappedCash;uint256 claim;uint256 limit;uint256 delta;PaymentConnection actualPayment;}
 mapping(uint256=>Epoch) public epochs;
 mapping(uint256=>mapping(address=>Member)) public members;
 mapping(bytes32=>Specification) public specifications;
 mapping(uint256=>bool) public positionVerified;
 error Forbidden(); error Pending(); error Mismatch(); error Duplicate();
 constructor(address coordinator_) {
  if(block.chainid!=31337||coordinator_.code.length==0)revert Forbidden();
  coordinator=Coordinator(coordinator_);core=coordinator.core();funding=coordinator.funding();partialSettlement=coordinator.partialSettlement();attribution=coordinator.attribution();
  if(core.localFunding()!=address(funding)||core.localPartial()!=address(partialSettlement)||address(funding.core())!=address(core)||address(partialSettlement.core())!=address(core)||partialSettlement.funding()!=address(funding)||partialSettlement.attribution()!=address(attribution)||attribution.funding()!=address(funding)||address(attribution.core())!=address(core)||funding.collectionCoordinator()!=coordinator_)revert Mismatch();
 }
 function productionEnabled() external pure returns(bool){return false;}
 function actualPaymentStatus() external pure returns(PaymentConnection){return PaymentConnection.NotConnected;}
 function paymentAuthorization(bytes32) external pure returns(bytes32){revert Forbidden();}
 function cumulativeLimit(uint256 collected,uint256 claim_,uint256 denominator) public pure returns(uint256){
  if(denominator==0||claim_>denominator)revert Pending();
  return M.mulDiv(collected<denominator?collected:denominator,claim_,denominator,false);
 }
 function _integer(M.Fraction memory f) private pure returns(uint256){if(f.d==0||f.n<0||uint256(f.n)%f.d!=0)revert Pending();return uint256(f.n)/f.d;}
 function _raw(M.Fraction memory f,Coordinator.Policy memory p,uint8 dec) private pure returns(uint256){return _integer(M.scaleFraction(f,10**dec,p.mock.fundingPrice18));}
 function _live(uint256 id) private view returns(Coordinator.Policy memory p,uint256[11] memory e,int256 n,uint256 d){
  p=coordinator.mockPolicy(id);Core.Domain memory dom=core.domain(id);
  (uint256[11] memory s,bytes32 policy)=funding.fundingSeries(id,p.sid);
  if(p.sid==0||p.epochs!=1||s[2]!=1||p.mock.calculationPolicy!=coordinator.CALCULATION_POLICY()||p.mock.observationTag==bytes32(0)||p.mock.fundingPrice18==0||p.fundingPolicy!=policy||policy!=dom.cfg.policyDigest||dom.state!=Core.State.Normal||(dom.decimals_!=6&&dom.decimals_!=18)||funding.collectionCoordinator()!=address(coordinator))revert Pending();
  (e,n,d)=funding.fundingSeriesEpoch(id,p.sid,1);
  (uint256 sid,bytes32 bp,uint256 l,uint256 sh)=core.exposureBindings(id);
  if(e[10]!=3||e[6]!=e[7]||e[3]!=e[8]||e[4]!=e[9]||sid!=p.sid||bp!=policy||l+sh!=0||s[8]+s[9]!=0||n<0||d==0)revert Pending();
 }
 function begin(uint256 id,uint256 batch) external {
  if(msg.sender!=core.domain(id).governor)revert Forbidden();
  if(epochs[id].sid!=0)revert Duplicate();
  (Coordinator.Policy memory p,uint256[11] memory e,,)=_live(id);
  if(batch==0||batch>core.domain(id).cfg.maxBatch||e[6]==0)revert Pending();
  Epoch storage z=epochs[id];z.sid=p.sid;z.batch=batch;z.basis=p.basisHash;z.participants=e[6];
  z.epochKey=keccak256(abi.encode(address(coordinator),id,p.sid,uint256(1),p.basisHash));
 }
 function verifyMember(uint256 id,address who,uint256[] calldata pids) external {
  Epoch storage z=epochs[id];Member storage a=members[id][who];
  if(z.sid==0||z.sealed_||a.verified)revert Duplicate();
  if(pids.length==0||pids.length>z.batch)revert Pending();
  (Coordinator.Policy memory p,,,)=_live(id);if(p.basisHash!=z.basis)revert Mismatch();
  uint256[8] memory m=funding.fundingSeriesMember(id,z.sid,1,who);
  Attribution.Total memory total=attribution.accountEpoch(id,who,1);
  if(m[2]!=1||m[3]!=1||!total.done||total.le!=m[0]||total.se!=m[1])revert Pending();
  uint8 dec=core.domain(id).decimals_;
  uint256 debt=_raw(M.fraction(M.signed(m[4],false),m[5]),p,dec);
  uint256 claim_=_raw(M.fraction(M.signed(m[6],false),m[7]),p,dec);
  uint256 le;uint256 se;uint256 pd;uint256 pc;uint256 transitions;
  for(uint256 i;i<pids.length;i++){
   uint256 pid=pids[i];if(positionVerified[pid])revert Duplicate();
   Coordinator.Plan memory plan=coordinator.plan(pid);Coordinator.SealedPlan memory seal=coordinator.sealedPlan(pid);
   (address owner,uint256[5] memory v,bytes32 policy)=core.coreExposureContext(pid);
   Partial.LinkedBasis memory b=partialSettlement.linkedBasis(pid);
   (,bool closed_,bool gap)=funding.policyGap(id,z.sid,who,pid);
   if(owner!=who||v[0]!=id||v[1]!=z.sid||v[3]+v[4]!=0||policy!=p.fundingPolicy||v[2]<2||b.closed!=b.initialSize||b.sequence!=v[2]||plan.domain!=id||plan.pid!=pid||plan.sequence!=v[2]||plan.firstEpoch!=1||plan.lastEpoch!=1||seal.settlementId==bytes32(0)||seal.planHash!=keccak256(abi.encode(plan))||!closed_||gap)revert Pending();
   (uint256 l,uint256 s,M.Fraction memory dd,M.Fraction memory cc)=attribution.positionEpoch(pid,1);
   uint256 dr=_raw(dd,p,dec);uint256 cr=_raw(cc,p,dec);
   if(dr!=_integer(plan.fundingDebtRaw)||cr!=_integer(plan.fundingClaimRaw))revert Mismatch();
   // Reject any unresolved PnL/fee token fractions; no rounding write-off.
   _integer(plan.pnlGainRaw);_integer(plan.pnlLossRaw);_integer(plan.feesRaw);
   le+=l;se+=s;pd+=dr;pc+=cr;transitions+=v[2];positionVerified[pid]=true;
  }
  (uint256 count,uint256 reserved,uint256 livePid,)=attribution.logs(attribution.accountKey(id,who));
  if(reserved!=0||livePid!=0||transitions!=count||le!=m[0]||se!=m[1]||pd!=debt||pc!=claim_)revert Mismatch();
  a.verified=true;a.claim=claim_;z.verified++;z.le+=le;z.se+=se;z.debt+=debt;z.claims+=claim_;
  if(z.verified>z.participants)revert Mismatch();
  z.rightsRoot=keccak256(abi.encode(z.rightsRoot,who,pids,le,se,debt,claim_));
 }
 function sealDenominator(uint256 id) external {
  Epoch storage z=epochs[id];if(z.sid==0||z.sealed_)revert Duplicate();
  (Coordinator.Policy memory p,uint256[11] memory e,int256 n,uint256 d)=_live(id);
  uint256 official=_raw(M.fraction(n,d),p,core.domain(id).decimals_);
  if(p.basisHash!=z.basis||z.verified!=z.participants||z.participants!=e[6]||z.le!=e[3]||z.se!=e[4]||official==0||z.claims!=official||z.debt!=official)revert Pending();
  z.denominator=official;z.sealed_=true;
 }
 function specify(uint256 id,uint256 expectedSequence,bytes32 expectedPrevious) external returns(bytes32 key){
  Epoch storage z=epochs[id];Member storage a=members[id][msg.sender];
  if(!z.sealed_||!a.verified||a.claim==0)revert Pending();
  (Coordinator.Policy memory p,,,)=_live(id);if(p.basisHash!=z.basis)revert Mismatch();
  if(expectedSequence!=a.sequence+1||expectedPrevious!=a.latest)revert Duplicate();
  uint256 collected=funding.repeatCash(z.epochKey);uint256 c=collected<z.denominator?collected:z.denominator;
  if(c<=a.cashSnapshot||collected>funding.repeatCustody(core.domain(id).token))revert Pending();
  uint256 target=cumulativeLimit(c,a.claim,z.denominator);uint256 delta=target-a.modeled;
  if(z.modeledTotal+delta>c)revert Mismatch();
  key=keccak256(abi.encode("NOT_PAYMENT_AUTHORIZATION",block.chainid,address(this),address(coordinator),address(funding),id,z.epochKey,z.basis,z.rightsRoot,msg.sender,expectedSequence,expectedPrevious,collected,c,a.claim,target));
  if(specifications[key].account!=address(0))revert Duplicate();
  specifications[key]=Specification(z.epochKey,msg.sender,expectedSequence,collected,c,a.claim,target,delta,PaymentConnection.NotConnected);
  a.sequence=expectedSequence;a.latest=key;a.cashSnapshot=c;a.modeled=target;z.modeledTotal+=delta;
  emit Modeled(key,id,msg.sender,expectedSequence,target,delta);
 }
 event Modeled(bytes32 indexed specification,uint256 indexed domain,address indexed account,uint256 sequence,uint256 cumulativeLimit,uint256 modeledDelta);
}
