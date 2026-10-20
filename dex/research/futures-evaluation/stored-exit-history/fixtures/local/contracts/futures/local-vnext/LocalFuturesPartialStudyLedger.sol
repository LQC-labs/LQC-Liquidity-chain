// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore} from "./LocalFuturesCore.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface IPartialStudyPeer {function core() external view returns(address);function funding() external view returns(address);function studyLedger() external view returns(address);}
/// @notice LOCAL calculation/rights only. No token custody, approvals, transfers or payment authority.
/// Fresh constructor-bound namespace only; no imports, resets or migration entry points.
contract LocalFuturesPartialStudyLedger {
 address public immutable partialSettlement;
 LocalFuturesCore public immutable core;
 address public immutable funding;
 uint256 private entered;
 struct PartialStudy {uint256 positionId;uint256 size;uint256 margin;uint256 closed;uint256 entry;uint256 collateral;uint256 debt;uint256 claim;uint256 released;uint256 lossCharged;uint256 lossFloor;uint256 gain;uint256 fundingPaid;uint256 fundingCredit;uint256 fee;uint256 sequence;bool long_;M.Fraction gains;M.Fraction losses;}
 mapping(uint256=>mapping(address=>PartialStudy)) private partialStudies;
 error Forbidden();error Invalid();error PolicyBlocked();error Insufficient();error Reentrant();
 constructor(address core_,address funding_,address partial_){
  if(block.chainid!=31337||core_.code.length==0||funding_.code.length==0||msg.sender!=partial_||partial_.code.length!=0)revert PolicyBlocked();
  partialSettlement=partial_;core=LocalFuturesCore(payable(core_));funding=funding_;
  if(core.localFunding()!=funding_)revert Invalid();
 }
 function productionEnabled() external pure returns(bool){return false;}
 modifier onlyPartial(){
  if(msg.sender!=partialSettlement||core.localPartial()!=partialSettlement||IPartialStudyPeer(partialSettlement).core()!=address(core)||IPartialStudyPeer(partialSettlement).funding()!=funding||IPartialStudyPeer(partialSettlement).studyLedger()!=address(this))revert Forbidden();
  if(entered!=0)revert Reentrant();entered=1;_;entered=0;
 }
 function open(uint256 id,address who,uint256 pid,uint256 size,uint256 margin,bool long_,uint256 pm,uint256 pc,uint256 debt,uint256 claim_) external onlyPartial {
  LocalFuturesCore.Domain memory d=core.domain(id);PartialStudy storage p=partialStudies[id][who];
  if(d.state!=LocalFuturesCore.State.Normal||!d.cfg.fundingPolicyReady)revert PolicyBlocked();
  if(who==address(0)||pid==0||p.size!=0||size<d.cfg.minOrder||size>d.cfg.maxOrder||size>d.cfg.maxPosition||margin==0||margin>1e36)revert Invalid();
  if(M.usd18(margin,pc,d.decimals_)<M.mulDiv(size,d.cfg.initialMarginBps,10000,true))revert Insufficient();
  p.positionId=pid;p.size=size;p.margin=margin;p.entry=pm;p.collateral=pc;p.debt=debt;p.claim=claim_;p.long_=long_;p.gains=M.fraction(0,1);p.losses=M.fraction(0,1);
 }
 // v: pid,closed,gain,loss,debt,claim,releasedDelta,gainDelta,lossFloorDelta,
 // newRefund,oldRefund,feeDelta,take,pay,receive,remaining,baseReduction,fraction/direction flags.
 function reduce(uint256 id,address who,uint256 quantity,uint256 sequence,uint256 pm,uint256 pc) external onlyPartial returns(uint256[18] memory v){
  LocalFuturesCore.Domain memory d=core.domain(id);PartialStudy storage p=partialStudies[id][who];
  if(d.state!=LocalFuturesCore.State.Normal||p.size==0||quantity==0||quantity>p.size-p.closed||sequence!=p.sequence+1)revert Invalid();
  if(pc!=p.collateral)revert PolicyBlocked();
  uint256 flags=(uint256(p.gains.n)%p.gains.d!=0?1:0)+(uint256(p.losses.n)%p.losses.d!=0?2:0)+(p.long_?16:0);
  uint256 closed=p.closed+quantity;uint256 released=M.mulDiv(p.margin,closed,p.size,false);
  (M.Fraction memory pnl,,)=M.experimentalLegs(quantity,p.entry,pm,0,p.long_,pc,d.decimals_);
  if(pnl.n>=0)p.gains=M.addFraction(p.gains,pnl);else p.losses=M.addFraction(p.losses,M.fraction(-pnl.n,pnl.d));
  uint256 gain=uint256(p.gains.n)/p.gains.d;uint256 lossFloor=uint256(p.losses.n)/p.losses.d;uint256 loss=lossFloor+(uint256(p.losses.n)%p.losses.d==0?0:1);
  uint256 debt=M.mulDiv(p.debt,closed,p.size,false);uint256 claim_=M.mulDiv(p.claim,closed,p.size,false);
  uint256 feeUsd=M.mulDiv(closed,d.cfg.feeBps,10000,true);(int256 feeRaw,,)=M.tokens(-M.signed(feeUsd*1e9,false),pc,d.decimals_);uint256 fee=M.abs(feeRaw);
  uint256 take=loss-p.lossCharged+debt-p.fundingPaid+fee-p.fee;
  uint256 remaining=p.size-closed;
  if(take>released-p.released)revert Insufficient();
  if(remaining!=0&&M.usd18(p.margin-released,pc,d.decimals_)<M.mulDiv(remaining,d.cfg.maintenanceBps,10000,true))revert Insufficient();
  flags+=(uint256(p.gains.n)%p.gains.d!=0?4:0)+(uint256(p.losses.n)%p.losses.d!=0?8:0);
  v=[p.positionId,closed,gain,loss,debt,claim_,released-p.released,gain-p.gain,lossFloor-p.lossFloor,loss-lossFloor,p.lossCharged-p.lossFloor,fee-p.fee,take,debt-p.fundingPaid,claim_-p.fundingCredit,remaining,p.long_?M.mulDiv(p.size-p.closed,1e27,p.entry,true)-M.mulDiv(remaining,1e27,p.entry,true):0,flags];
  p.closed=closed;p.released=released;p.lossCharged=loss;p.lossFloor=lossFloor;p.gain=gain;p.fee=fee;p.fundingPaid=debt;p.fundingCredit=claim_;p.sequence=sequence;
 }
 function progress(uint256 id,address who) external view returns(uint256[12] memory){PartialStudy storage p=partialStudies[id][who];return [p.size,p.margin,p.closed,p.released,p.gain,p.lossCharged,p.lossFloor,p.fundingPaid,p.fundingCredit,p.fee,p.sequence,p.margin-p.released];}
 function fractions(uint256 id,address who) external view returns(int256,uint256,int256,uint256){PartialStudy storage p=partialStudies[id][who];return(p.gains.n,p.gains.d,p.losses.n,p.losses.d);}
 function rights(uint256 id,address who) external view returns(uint256,uint256,uint256){PartialStudy storage p=partialStudies[id][who];return(p.released-p.lossCharged-p.fundingPaid-p.fee,p.gain,p.fundingCredit);}
 function completion(uint256 id,address who) external view returns(bool,uint256,uint256){PartialStudy storage p=partialStudies[id][who];bool clear=p.size!=0&&p.closed==p.size&&uint256(p.gains.n)%p.gains.d==0&&uint256(p.losses.n)%p.losses.d==0;return(clear,p.positionId,p.sequence);}
}
