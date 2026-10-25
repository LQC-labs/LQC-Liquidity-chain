// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesPayoutSpecification as Payout} from "./LocalFuturesPayoutSpecification.sol";
import {LocalFuturesCore as Core} from "./LocalFuturesCore.sol";
import {LocalFuturesFunding as Funding,IRepeatPayoutExecutor} from "./LocalFuturesFunding.sol";
import {LocalFuturesPartialSettlement as Partial} from "./LocalFuturesPartialSettlement.sol";
import {LocalFuturesSettlementCoordinator as Coordinator} from "./LocalFuturesSettlementCoordinator.sol";
import {LocalFuturesAttribution as Attribution} from "./LocalFuturesAttribution.sol";
import {SettlementMath as M} from "./SettlementMath.sol";

// Static structs have the same ABI encoding as the existing public mapping
// getters' flat tuples. No change to the source contracts or their ABI.
interface IPayoutSnapshot {
 struct Epoch {bytes32 basis;bytes32 epochKey;bytes32 rightsRoot;uint256 sid;uint256 batch;uint256 participants;uint256 verified;uint256 le;uint256 se;uint256 debt;uint256 claims;uint256 denominator;uint256 modeledTotal;bool sealed_;}
 struct Member {bool verified;uint256 claim;uint256 modeled;uint256 sequence;uint256 cashSnapshot;bytes32 latest;}
 struct Specification {bytes32 epochKey;address account;uint256 sequence;uint256 collected;uint256 cappedCash;uint256 claim;uint256 limit;uint256 delta;Payout.PaymentConnection actualPayment;}
 function epochs(uint256) external view returns(Epoch memory);
 function members(uint256,address) external view returns(Member memory);
 function specifications(bytes32) external view returns(Specification memory);
}
interface IPayoutDomainGuard {function cutoff() external view returns(uint256);function assertLegacyDomain(uint256) external view;function assertOperation(uint256,bytes4) external view;}

/// @notice LOCAL no-money preparation only. No actual payment sequence, receipt,
/// reservation, token authority or user credit can be created by this module.
contract LocalFuturesPayoutExecutor {
 Payout public immutable payoutSpecification;
 Core public immutable core;
 Funding public immutable funding;
 Partial public immutable partialSettlement;
 Coordinator public immutable coordinator;
 Attribution public immutable attribution;
 bytes32 public immutable contextHash;
 enum PaymentConnection {NotConnected}
 struct Progress {uint256 preparationSequence;uint256 calculationSequence;uint256 collected;uint256 cumulativeLimit;bytes32 latestPreparation;bytes32 specification;}
 struct Preparation {bytes32 rightsKey;bytes32 specification;bytes32 epochKey;bytes32 basis;bytes32 rightsRoot;address account;uint256 domain;uint256 series;uint256 epoch;uint256 denominator;uint256 claim;uint256 collected;uint256 cappedCash;uint256 cumulativeLimit;uint256 modeledIncrease;uint256 preparationSequence;uint256 calculationSequence;PaymentConnection paymentConnection;}
 mapping(bytes32=>Progress) public progression;
 mapping(bytes32=>Preparation) public preparations;
 mapping(bytes32=>bool) public preparedSpecifications;
 // Append-only readiness evidence; actual money and payment sequences stay in Funding.
 struct ReadinessRound {bytes32 commitment;uint256 denominator;uint256 collected;uint256 cappedCash;uint256 preparedClaims;uint256 preparedAccounts;}
 struct AccountReadiness {uint256 generation;bytes32 preparation;}
 mapping(uint256=>uint256) public readinessGeneration;
 mapping(uint256=>mapping(uint256=>ReadinessRound)) private readinessRounds;
 mapping(bytes32=>AccountReadiness) public accountReadiness;
 function _readinessContext(uint256 id) private view returns(bytes32 commitment,uint256 r,uint256 g,uint256 c){
  IPayoutSnapshot.Epoch memory z=IPayoutSnapshot(address(payoutSpecification)).epochs(id);
  r=z.denominator;g=funding.repeatCash(z.epochKey);c=g<r?g:r;
  if(!z.sealed_||r==0||z.verified!=z.participants||z.claims!=r||z.debt!=r)revert Pending();
  commitment=keccak256(abi.encode("ALL_POSITIVE_CREDITORS_PREPARED",block.chainid,contextHash,id,z.sid,uint256(1),z.epochKey,z.basis,z.rightsRoot,r,g,c,coordinator.mockPolicy(id)));
 }
 function payoutReadiness(uint256 id) external view returns(uint256 generation,ReadinessRound memory round,bool ready){
  generation=readinessGeneration[id];round=readinessRounds[id][generation];
  (bytes32 commitment,uint256 r,uint256 g,)=_readinessContext(id);
  ready=g<=r&&generation!=0&&round.commitment==commitment&&round.preparedClaims==r;
 }
 function _recordReadiness(Preparation memory p,bytes32 preparation) private {
  (bytes32 commitment,uint256 r,uint256 g,uint256 c)=_readinessContext(p.domain);
  if(g>r||p.denominator!=r||p.collected!=g||p.cappedCash!=c)revert Pending();
  uint256 generation=readinessGeneration[p.domain];
  if(generation==0||readinessRounds[p.domain][generation].commitment!=commitment){
   generation++;readinessGeneration[p.domain]=generation;
   readinessRounds[p.domain][generation]=ReadinessRound(commitment,r,g,c,0,0);
  }
  if(accountReadiness[p.rightsKey].generation==generation)revert Duplicate();
  ReadinessRound storage round=readinessRounds[p.domain][generation];
  if(p.claim==0||round.preparedClaims+p.claim>r)revert Mismatch();
  round.preparedClaims+=p.claim;round.preparedAccounts++;
  accountReadiness[p.rightsKey]=AccountReadiness(generation,preparation);
 }
 error Forbidden();error Pending();error Mismatch();error Duplicate();
 constructor(address specification_){
  if(block.chainid!=31337||specification_.code.length==0)revert Forbidden();
  payoutSpecification=Payout(specification_);core=payoutSpecification.core();funding=payoutSpecification.funding();partialSettlement=payoutSpecification.partialSettlement();coordinator=payoutSpecification.coordinator();attribution=payoutSpecification.attribution();
  if(core.localFunding()!=address(funding)||core.localPartial()!=address(partialSettlement)||address(funding.core())!=address(core)||address(partialSettlement.core())!=address(core)||partialSettlement.funding()!=address(funding)||partialSettlement.attribution()!=address(attribution)||address(coordinator.core())!=address(core)||address(coordinator.funding())!=address(funding)||address(coordinator.partialSettlement())!=address(partialSettlement)||address(coordinator.attribution())!=address(attribution)||address(attribution.core())!=address(core)||attribution.funding()!=address(funding)||attribution.partialSettlement()!=address(partialSettlement)||funding.collectionCoordinator()!=address(coordinator)||payoutSpecification.productionEnabled()||payoutSpecification.actualPaymentStatus()!=Payout.PaymentConnection.NotConnected)revert Mismatch();
  contextHash=keccak256(abi.encode(block.chainid,address(core),address(funding),address(partialSettlement),address(coordinator),address(attribution),specification_));
 }
 function validateBinding(address expectedCore,address expectedPartial,address expectedCoordinator) external view returns(address){
  if(msg.sender!=address(funding)||address(core)!=expectedCore||address(partialSettlement)!=expectedPartial||address(coordinator)!=expectedCoordinator)revert Forbidden();
  if(core.localFunding()!=address(funding)||core.localPartial()!=address(partialSettlement)||address(funding.core())!=address(core)||address(partialSettlement.core())!=address(core)||partialSettlement.funding()!=address(funding)||funding.collectionCoordinator()!=address(coordinator))revert Forbidden();
  return address(payoutSpecification);
 }
 function productionEnabled() external pure returns(bool){return false;}
 function actualPaymentStatus() external pure returns(PaymentConnection){return PaymentConnection.NotConnected;}
 function actualSequenceAvailable() external pure returns(bool){return false;}
 function paymentAuthorization(bytes32) external pure returns(bytes32){revert Forbidden();}
 function _integer(M.Fraction memory f) private pure returns(uint256){if(f.d==0||f.n<0||uint256(f.n)%f.d!=0)revert Pending();return uint256(f.n)/f.d;}
 function _convert(uint256 n,uint256 d,uint256 price,uint8 dec) private pure returns(uint256){return _integer(M.scaleFraction(M.fraction(M.signed(n,false),d),10**dec,price));}
 function rightsKey(uint256 id,address who) public view returns(bytes32){
  Coordinator.Policy memory p=coordinator.mockPolicy(id);
  return keccak256(abi.encode("REPEAT_FUNDING_ACCOUNT_RIGHT",block.chainid,address(core),address(funding),address(partialSettlement),address(coordinator),id,p.sid,uint256(1),who,p.fundingPolicy,p.basisHash));
 }
 function _checked(uint256 id,bytes32 specification,address who) private view returns(Preparation memory out){
  address registry=address(core.domainRegistry());if(registry!=address(0)){IPayoutDomainGuard r=IPayoutDomainGuard(registry);if(id<=r.cutoff())r.assertLegacyDomain(id);else r.assertOperation(id,msg.sig);}
  IPayoutSnapshot snapshot=IPayoutSnapshot(address(payoutSpecification));
  IPayoutSnapshot.Epoch memory z=snapshot.epochs(id);IPayoutSnapshot.Member memory member=snapshot.members(id,who);IPayoutSnapshot.Specification memory s=snapshot.specifications(specification);
  Coordinator.Policy memory p=coordinator.mockPolicy(id);Core.Domain memory dom=core.domain(id);
  if(!z.sealed_||z.denominator==0||z.verified!=z.participants||z.claims!=z.denominator||z.debt!=z.denominator||!member.verified||member.claim==0||member.latest!=specification||s.account!=who||s.sequence!=member.sequence||s.claim!=member.claim||s.limit!=member.modeled||s.delta>s.limit||s.actualPayment!=Payout.PaymentConnection.NotConnected||payoutSpecification.actualPaymentStatus()!=Payout.PaymentConnection.NotConnected)revert Pending();
  if(p.sid!=z.sid||p.epochs!=1||z.basis!=p.basisHash||p.mock.calculationPolicy!=coordinator.CALCULATION_POLICY()||p.mock.observationTag==bytes32(0)||p.mock.fundingPrice18==0||p.fundingPolicy!=dom.cfg.policyDigest||dom.state!=Core.State.Normal||(dom.decimals_!=6&&dom.decimals_!=18)||funding.collectionCoordinator()!=address(coordinator)||core.localFunding()!=address(funding)||core.localPartial()!=address(partialSettlement))revert Mismatch();
  (uint256[11] memory series,bytes32 policy)=funding.fundingSeries(id,z.sid);
  (uint256[11] memory e,int256 usdN,uint256 usdD)=funding.fundingSeriesEpoch(id,z.sid,1);
  (uint256 sid,bytes32 boundPolicy,uint256 l,uint256 sh)=core.exposureBindings(id);
  if(series[2]!=1||series[8]+series[9]!=0||policy!=p.fundingPolicy||sid!=z.sid||boundPolicy!=policy||l+sh!=0||e[10]!=3||e[6]!=e[7]||e[6]!=z.participants||e[3]!=e[8]||e[4]!=e[9]||e[3]!=z.le||e[4]!=z.se||block.timestamp<e[1]||usdN<0||_convert(uint256(usdN),usdD,p.mock.fundingPrice18,dom.decimals_)!=z.denominator)revert Pending();
  uint256[8] memory m=funding.fundingSeriesMember(id,z.sid,1,who);Attribution.Total memory a=attribution.accountEpoch(id,who,1);
  if(m[2]!=1||m[3]!=1||!a.done||a.le!=m[0]||a.se!=m[1]||a.claim_.n!=M.signed(m[6],false)||a.claim_.d!=m[7]||_convert(m[6],m[7],p.mock.fundingPrice18,dom.decimals_)!=member.claim)revert Pending();
  _convert(m[4],m[5],p.mock.fundingPrice18,dom.decimals_);
  (uint256 count,uint256 reserved,uint256 livePid,)=attribution.logs(attribution.accountKey(id,who));
  if(count==0||reserved!=0||livePid!=0)revert Pending();
  Attribution.Transition memory last=attribution.transition(id,who,count);
  (,bool closed_,bool gap)=funding.policyGap(id,z.sid,who,last.pid);
  if(!closed_||gap||!payoutSpecification.positionVerified(last.pid))revert Pending();
  bytes32 epochKey=keccak256(abi.encode(address(coordinator),id,z.sid,uint256(1),p.basisHash));uint256 collected=funding.repeatCash(epochKey);uint256 c=collected<z.denominator?collected:z.denominator;
  uint256 cap=M.mulDiv(c,member.claim,z.denominator,false);
  // Snapshot freshness, NOT a comparison of gross receipts to remaining custody.
  if(z.epochKey!=epochKey||s.epochKey!=epochKey||s.collected!=collected||s.cappedCash!=c||member.cashSnapshot!=c||s.limit!=cap||z.modeledTotal>c)revert Mismatch();
  out.rightsKey=rightsKey(id,who);out.specification=specification;out.epochKey=epochKey;out.basis=z.basis;out.rightsRoot=z.rightsRoot;out.account=who;out.domain=id;out.series=z.sid;out.epoch=1;out.denominator=z.denominator;out.claim=member.claim;out.collected=collected;out.cappedCash=c;out.cumulativeLimit=cap;out.calculationSequence=s.sequence;out.paymentConnection=PaymentConnection.NotConnected;
 }
 function prepare(uint256 id,bytes32 specification,uint256 expectedSequence,bytes32 expectedPrevious) external returns(bytes32 preparation){
  (Funding.RepeatPayoutEpoch memory epoch,,)=funding.repeatPayoutState(id,bytes32(0),bytes32(0));if(epoch.started)revert Pending();
  Preparation memory p=_checked(id,specification,msg.sender);Progress storage old=progression[p.rightsKey];
  if(preparedSpecifications[specification]||expectedSequence!=old.preparationSequence+1||expectedPrevious!=old.latestPreparation||p.calculationSequence<=old.calculationSequence||p.collected<old.collected||p.cumulativeLimit<old.cumulativeLimit)revert Duplicate();
  p.preparationSequence=expectedSequence;p.modeledIncrease=p.cumulativeLimit-old.cumulativeLimit;
  preparation=keccak256(abi.encode("PREPARATION_NOT_PAYMENT",address(this),contextHash,p,expectedPrevious));
  preparations[preparation]=p;preparedSpecifications[specification]=true;
  progression[p.rightsKey]=Progress(expectedSequence,p.calculationSequence,p.collected,p.cumulativeLimit,preparation,specification);
  _recordReadiness(p,preparation);
  emit Prepared(p.rightsKey,preparation,specification,expectedSequence,p.calculationSequence,p.cumulativeLimit);
 }
 function payoutQuote(uint256 id,address who,bytes32 preparation) public view returns(IRepeatPayoutExecutor.Quote memory q){
  if(funding.payoutExecutor()!=address(this)||funding.payoutSpecification()!=address(payoutSpecification))revert Forbidden();
  Preparation storage p=preparations[preparation];if(p.account!=who||p.domain!=id||p.epoch!=1||progression[p.rightsKey].latestPreparation!=preparation)revert Pending();
  Preparation memory live=_checked(id,p.specification,who);
  if(live.rightsKey!=p.rightsKey||live.epochKey!=p.epochKey||live.basis!=p.basis||live.rightsRoot!=p.rightsRoot||live.denominator!=p.denominator||live.claim!=p.claim||live.collected!=p.collected||live.cumulativeLimit!=p.cumulativeLimit||live.calculationSequence!=p.calculationSequence)revert Mismatch();
  q=IRepeatPayoutExecutor.Quote(p.rightsKey,p.epochKey,p.cumulativeLimit,p.claim,p.denominator,p.collected);
 }
 function authorizePayout(uint256 id,address who,bytes32 preparation) external view returns(bytes32,bytes32,uint256){
  if(msg.sender!=address(funding))revert Forbidden();
  (bytes32 commitment,uint256 r,uint256 g,)=_readinessContext(id);
  uint256 generation=readinessGeneration[id];ReadinessRound storage round=readinessRounds[id][generation];
  if(g>r||generation==0||round.commitment!=commitment||round.preparedClaims!=r)revert Pending();
  IRepeatPayoutExecutor.Quote memory q=payoutQuote(id,who,preparation);
  AccountReadiness storage member=accountReadiness[q.rightsKey];
  if(member.generation!=generation||member.preparation!=preparation)revert Pending();
  return(q.rightsKey,q.epochKey,q.limit);
 }
 function validateReceipt(uint256 id,address who,bytes32 preparation,uint256 sequence,uint256 amount,bytes32 receipt,uint256 cumulative) external view returns(bytes32,uint256){
  if(msg.sender!=address(partialSettlement)||funding.payoutExecutor()!=address(this)||funding.payoutSpecification()!=address(payoutSpecification))revert Forbidden();
  Preparation storage p=preparations[preparation];
  (,Funding.RepeatPayoutAccount memory account,bytes32 commitment)=funding.repeatPayoutState(id,p.rightsKey,receipt);
  bytes memory data=abi.encodeCall(funding.payRepeat,(id,who,preparation,sequence,amount));
  if(p.account!=who||p.domain!=id||p.epoch!=1||progression[p.rightsKey].latestPreparation!=preparation||account.preparation!=preparation||account.sequence!=sequence||account.paid!=cumulative||account.limit!=p.cumulativeLimit||cumulative>account.limit||receipt!=keccak256(abi.encode(p.rightsKey,sequence))||commitment!=keccak256(abi.encode(data,cumulative)))revert Mismatch();
  return(p.rightsKey,account.limit);
 }
 event Prepared(bytes32 indexed rightsKey,bytes32 indexed preparation,bytes32 indexed specification,uint256 preparationSequence,uint256 calculationSequence,uint256 cumulativeLimit);
}
