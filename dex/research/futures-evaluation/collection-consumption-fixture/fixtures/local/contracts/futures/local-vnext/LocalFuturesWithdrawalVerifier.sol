// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore} from "./LocalFuturesCore.sol";
import {IRepeatPayoutExecutor} from "./LocalFuturesFunding.sol";
import {LocalFuturesFundingV11 as WithdrawalFunding} from "./LocalFuturesFundingV11.sol";
import {LocalFuturesSettlementCoordinator as WithdrawalCoordinator} from "./LocalFuturesSettlementCoordinator.sol";
import {LocalFuturesAttribution as WithdrawalAttribution} from "./LocalFuturesAttribution.sol";
import {LocalFuturesPayoutExecutor as WithdrawalExecutor} from "./LocalFuturesPayoutExecutor.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface IWithdrawalPartial {function attribution() external view returns(address);function funding() external view returns(address);function core() external view returns(address);}
/// @notice LOCAL view-only eligibility. No custody, token authority or independently issued rights.
contract LocalFuturesWithdrawalVerifier {
 LocalFuturesCore public immutable core;
 address public immutable funding;
 address public immutable partialSettlement;
 error Forbidden();error SettlementPending();
 struct Authorization {address account;uint256 domain;bytes32 context;bytes32 rightsKey;bytes32 epochKey;bytes32 preparation;uint256 cumulativeCeiling;}
 constructor(address core_,address funding_,address partial_){
  if(block.chainid!=31337||msg.sender!=partial_||core_.code.length==0||funding_.code.length==0)revert Forbidden();
  core=LocalFuturesCore(payable(core_));funding=funding_;partialSettlement=partial_;
  if(address(WithdrawalFunding(funding_).core())!=core_)revert Forbidden();
 }
 function productionEnabled() external pure returns(bool){return false;}
 function context(uint256 id) public view returns(bytes32 context){
  if(msg.sender!=partialSettlement)revert Forbidden();address attribution=IWithdrawalPartial(partialSettlement).attribution();
  WithdrawalFunding f=WithdrawalFunding(funding);WithdrawalCoordinator c=WithdrawalCoordinator(f.collectionCoordinator());
  WithdrawalCoordinator.Policy memory p=c.mockPolicy(id);LocalFuturesCore.Domain memory d=core.domain(id);
  if(block.chainid!=31337||core.localPartial()!=partialSettlement||core.localFunding()!=funding||address(c.core())!=address(core)||address(c.funding())!=funding||address(c.partialSettlement())!=partialSettlement||address(c.attribution())!=attribution||p.sid==0||p.epochs!=1||p.fundingPolicy!=d.cfg.policyDigest||p.mock.calculationPolicy!=c.CALCULATION_POLICY()||p.mock.observationTag==bytes32(0)||p.basisHash==bytes32(0)||d.state!=LocalFuturesCore.State.Normal||(d.decimals_!=6&&d.decimals_!=18))revert SettlementPending();
  return keccak256(abi.encode("LOCAL_ZERO_GROSS_DEBT_WITHDRAWAL_V1",block.chainid,partialSettlement,address(core),funding,attribution,address(c),f.payoutExecutor(),f.payoutSpecification(),id,d.token,d.decimals_,p.sid,p.fundingPolicy,p.basisHash));
 }
 function _whole(M.Fraction memory value) private pure returns(uint256){
  if(value.d==0||value.n<0||uint256(value.n)%value.d!=0)revert SettlementPending();return uint256(value.n)/value.d;
 }
 function _withdrawalObligations(uint256 id,address who,WithdrawalExecutor executor,bytes32 preparation) private view returns(bytes32 key){
  address attribution=IWithdrawalPartial(partialSettlement).attribution();
  IRepeatPayoutExecutor.Quote memory quote=executor.payoutQuote(id,who,preparation);key=quote.rightsKey;
  WithdrawalCoordinator c=WithdrawalCoordinator(WithdrawalFunding(funding).collectionCoordinator());WithdrawalCoordinator.Policy memory policy=c.mockPolicy(id);
  WithdrawalAttribution a=WithdrawalAttribution(attribution);
  (uint256 count,uint256 reserved,uint256 live,)=a.logs(a.accountKey(id,who));
  if(count==0||count>256||reserved!=0||live!=0)revert SettlementPending();
  bytes32 accountKey=keccak256(abi.encode(address(c),address(core),funding,partialSettlement,attribution,id,policy.sid,policy.fundingPolicy,who,policy.basisHash));
  uint256 opened;uint256 claim;uint256 margin;
  // Enumerate the complete bounded official history, not a user-provided pid subset.
  for(uint256 ordinal=1;ordinal<=count;ordinal++){
   WithdrawalAttribution.Transition memory t=a.transition(id,who,ordinal);
   if(t.oldL+t.oldS!=0)continue;
   if(t.sequence!=1||t.nextL+t.nextS==0)revert SettlementPending();
   WithdrawalCoordinator.Plan memory p=c.plan(t.pid);WithdrawalCoordinator.SealedPlan memory z=c.sealedPlan(t.pid);
   (address owner,uint256[5] memory v,bytes32 fp)=core.coreExposureContext(t.pid);
   (,bool closed_,bool gap)=WithdrawalFunding(funding).policyGap(id,policy.sid,who,t.pid);
   if(owner!=who||v[0]!=id||v[1]!=policy.sid||v[3]+v[4]!=0||fp!=policy.fundingPolicy||p.id==bytes32(0)||p.pid!=t.pid||p.domain!=id||p.accountKey!=accountKey||p.sequence!=v[2]||p.firstEpoch!=1||p.lastEpoch!=1||z.settlementId==bytes32(0)||z.planHash!=keccak256(abi.encode(p))||!closed_||gap||!executor.payoutSpecification().positionVerified(t.pid))revert SettlementPending();
   if(_whole(p.fundingDebtRaw)!=0||_whole(p.pnlLossRaw)!=0||_whole(p.feesRaw)!=0||p.fundingDebtUsd18.d==0||p.fundingDebtUsd18.n!=0||p.pnlLossUsd27.d==0||p.pnlLossUsd27.n!=0)revert SettlementPending();
   _whole(p.pnlGainRaw);claim+=_whole(p.fundingClaimRaw);margin+=p.plannedMargin;opened++;
  }
  WithdrawalCoordinator.AccountPlan memory total=c.accountPlan(accountKey);
  WithdrawalAttribution.Total memory attributed=a.accountEpoch(id,who,1);
  uint256[8] memory official=WithdrawalFunding(funding).fundingSeriesMember(id,policy.sid,1,who);
  if(opened==0||total.count!=opened||total.plannedMargin!=margin||_whole(total.pnlLossRaw)!=0||_whole(total.fundingDebtRaw)!=0||_whole(total.feesRaw)!=0||_whole(total.fundingClaimRaw)!=claim||claim!=quote.claim||!attributed.done||attributed.debt.d==0||attributed.debt.n!=0||official[3]!=1||official[4]!=0||official[5]==0)revert SettlementPending();
  _whole(total.pnlGainRaw);
 }

 function validateWithdrawal(uint256 id,address who,bytes32 key) external view returns(Authorization memory result){
  if(msg.sender!=partialSettlement||IWithdrawalPartial(partialSettlement).core()!=address(core)||IWithdrawalPartial(partialSettlement).funding()!=funding)revert Forbidden();
  result.context=context(id);WithdrawalFunding f=WithdrawalFunding(funding);WithdrawalExecutor executor=WithdrawalExecutor(f.payoutExecutor());
  if(executor.rightsKey(id,who)!=key)revert Forbidden();
  (,WithdrawalFunding.RepeatPayoutAccount memory account,)=f.repeatPayoutState(id,key,bytes32(0));
  if(_withdrawalObligations(id,who,executor,account.preparation)!=key||account.paid>account.limit)revert SettlementPending();
  IRepeatPayoutExecutor.Quote memory quote=executor.payoutQuote(id,who,account.preparation);
  result.account=who;result.domain=id;result.rightsKey=key;result.epochKey=quote.epochKey;result.preparation=account.preparation;result.cumulativeCeiling=account.paid;
 }
}
