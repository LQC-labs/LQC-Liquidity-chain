// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore as Core} from "./LocalFuturesCore.sol";
import {IPartialFunding} from "./LocalFuturesPartialSettlement.sol";
import {LocalFuturesPartialSettlement as Partial} from "./LocalFuturesPartialSettlement.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface ILinkedPartial {function core() external view returns(address);function funding() external view returns(address);function partialPool(uint256) external view returns(uint256[12] memory);function linkedBasis(uint256) external view returns(Partial.LinkedBasis memory);function linkedExit(uint256,uint256,bool) external view returns(Partial.LinkedExit memory);function linkedCapacity(uint256) external view returns(uint256);}
/// @notice LOCAL view-only transition calculations; no custody, approval, transfer or rights issuance.
contract LocalFuturesLinkedExposureVerifier {
 Core public immutable core;address public immutable funding;address public immutable partialSettlement;
 error Forbidden();error Invalid();error PolicyBlocked();error Insufficient();
 struct Quote {address owner;uint256 pid;uint256 domain;uint256 sequence;uint256 remaining;bytes32 key;uint256 pm;uint256 pc;uint256 tm;uint256 tc;uint256 cutoff;uint256 epoch;uint256 closed;uint256 held;uint256 delta;uint256 quantity;uint256 base;uint256 shorts;uint256 expectedOi;}
 constructor(address core_,address funding_,address partial_){
  if(block.chainid!=31337||core_.code.length==0||funding_.code.length==0||partial_==address(0)||partial_.code.length!=0)revert PolicyBlocked();core=Core(payable(core_));funding=funding_;partialSettlement=partial_;
  if(msg.sender!=core.governance()||IPartialFunding(funding_).core()!=core_||core.localFunding()!=funding_)revert Forbidden();
 }
 modifier onlyPartial(){if(msg.sender!=partialSettlement||core.localPartial()!=partialSettlement||core.localFunding()!=funding||ILinkedPartial(partialSettlement).core()!=address(core)||ILinkedPartial(partialSettlement).funding()!=funding)revert Forbidden();_;}
 function productionEnabled() external pure returns(bool){return false;}
 function validateConfiguration(uint256 id) external view onlyPartial {
  Core.Domain memory d=core.domain(id);(uint256 sid,bytes32 policy,uint256 l,uint256 sh)=core.exposureBindings(id);(uint256[11] memory f,bytes32 fp)=IPartialFunding(funding).fundingSeries(id,sid);
  if(d.state!=Core.State.Normal||d.accounted!=0||d.oi!=0||sid==0||policy!=d.cfg.policyDigest||fp!=policy||l+sh!=0||block.timestamp>=f[0])revert PolicyBlocked();
 }
 function quote(uint256 pid,uint256 margin,bytes32 receipt,uint256 oldL,uint256 oldS) external view onlyPartial returns(Quote memory q){
  (address who,uint256[5] memory v,bytes32 policy)=core.coreExposureContext(pid);uint256 id=v[0];uint256 sid=v[1];q.owner=who;q.pid=pid;q.domain=id;q.sequence=v[2];q.remaining=v[3]+v[4];
  Core.Domain memory d=core.domain(id);ILinkedPartial p=ILinkedPartial(partialSettlement);uint256[12] memory pool=p.partialPool(id);Partial.LinkedBasis memory b=p.linkedBasis(pid);
  if(d.state!=Core.State.Normal||d.accounted!=0||d.oi!=0||policy!=d.cfg.policyDigest||who==address(0))revert PolicyBlocked();q.key=keccak256(abi.encode(address(core),funding,id,sid,who,pid,policy));
  if(IPartialFunding(funding).coreExposureSequences(q.key)!=q.sequence||receipt!=keccak256(abi.encode(q.key,q.sequence,block.timestamp,oldL,oldS,v[3],v[4])))revert Forbidden();
  (uint256[11] memory f,bytes32 fp)=IPartialFunding(funding).fundingSeries(id,sid);if(fp!=policy)revert Forbidden();(q.pm,q.pc,q.tm,q.tc)=core.observe(id);q.cutoff=f[0]+f[1]*f[2];q.epoch=block.timestamp>=q.cutoff?f[2]+1:(block.timestamp-f[0])/f[1]+1;q.expectedOi=f[8]+f[9];q.base=pool[10];q.shorts=pool[11];
  if(b.initialSize==0){
   if(pool[9]>=d.cfg.maxPositions||q.sequence!=1||oldL+oldS!=0||q.remaining==0||margin==0||margin>1e36||block.timestamp>=q.cutoff)revert Invalid();
   if(M.usd18(margin,q.pc,d.decimals_)<M.mulDiv(q.remaining,d.cfg.initialMarginBps,10000,true))revert Insufficient();
   if(v[3]!=0)q.base+=M.mulDiv(q.remaining,1e27,q.pm,true);else q.shorts+=q.remaining;
  }else{
   if(b.key!=q.key||margin!=0||q.sequence!=b.sequence+1||oldL+oldS!=b.initialSize-b.closed||q.remaining>=oldL+oldS||p.linkedExit(pid,0,true).status!=1)revert Invalid();
   q.closed=b.initialSize-q.remaining;q.held=M.mulDiv(b.margin,q.closed,b.initialSize,false);q.delta=q.held-b.held;q.quantity=q.closed-b.closed;
   if(q.remaining!=0){if(b.partials>=p.linkedCapacity(id))revert PolicyBlocked();if(p.linkedExit(pid,q.sequence,false).status!=0)revert Invalid();}
   if(oldL!=0)q.base=pool[10]-M.mulDiv(oldL,1e27,b.entry,true)+M.mulDiv(q.remaining,1e27,b.entry,true);else q.shorts=pool[11]-q.quantity;
  }
 }
 function checkMaintenance(uint256 pid,uint256 pc) external view onlyPartial {
  (,uint256[5] memory v,)=core.coreExposureContext(pid);Core.Domain memory d=core.domain(v[0]);Partial.LinkedBasis memory b=ILinkedPartial(partialSettlement).linkedBasis(pid);uint256 remaining=v[3]+v[4];
  if(remaining!=0&&M.usd18(b.margin-b.held,pc,d.decimals_)<M.mulDiv(remaining,d.cfg.maintenanceBps,10000,true))revert Insufficient();
 }
 function checkRisk(uint256 id,uint256 pm,uint256 pc) external view onlyPartial {
  Core.Domain memory d=core.domain(id);uint256[12] memory p=ILinkedPartial(partialSettlement).partialPool(id);
  uint256 need=M.mulDiv(p[10],pm,1e27,true)+p[11]+d.cfg.bufferUsd+M.mulDiv(p[8],d.cfg.stressBps,10000,true)+p[9]*d.cfg.liquidationCostUsd;
  if(M.usd18(p[1],pc,d.decimals_)<need)revert Insufficient();
 }
}
