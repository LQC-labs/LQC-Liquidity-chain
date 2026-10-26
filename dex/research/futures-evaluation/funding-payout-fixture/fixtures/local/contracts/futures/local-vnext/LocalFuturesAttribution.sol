// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore} from "./LocalFuturesCore.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface IAttributionPreparationRegistry {function cutoff() external view returns(uint256);function assertAttributionPreparation(uint256,uint256,uint256) external view;}
interface IAttributionPartial {
 function core() external view returns(address);
 function funding() external view returns(address);
 function attribution() external view returns(address);
 function linkedCapacity(uint256) external view returns(uint256);
 function researchTouched(uint256) external view returns(bool);
}
interface IAttributionFunding {
 function core() external view returns(address);
 function seriesInputMode(uint256,uint256) external view returns(uint8);
 function coreExposureSequences(bytes32) external view returns(uint256);
 function fundingSeries(uint256,uint256) external view returns(uint256[11] memory,bytes32);
 function fundingSeriesAccount(uint256,uint256,address) external view returns(uint256[4] memory);
 function fundingSeriesEpoch(uint256,uint256,uint256) external view returns(uint256[11] memory,int256,uint256);
 function fundingSeriesMember(uint256,uint256,uint256,address) external view returns(uint256[8] memory);
}
/// @notice LOCAL 31337 trace and USD attribution ONLY. No custody, approvals, claims,
/// conversion, release, payable entry, insurance or LP authority. Not live settlement.
contract LocalFuturesAttribution {
 LocalFuturesCore public immutable core;
 address public immutable funding;
 address public immutable partialSettlement;
 uint256 private entered;
 error Forbidden();error Invalid();error WrongState();error Capacity();error Duplicate();error Mismatch();
 modifier lock(){if(entered!=0)revert Forbidden();entered=1;_;entered=0;}
 struct Config {uint256 sid;bytes32 policy;uint256 origin;uint256 length;uint256 epochs;uint256 historyCap;uint256 batch;}
 struct Trace {bytes32 key;address owner;uint256 domain;uint256 sid;uint256 opened;uint256 last;uint256 size;uint256 sequence;bool long_;}
 struct Transition {uint256 timestamp;uint256 pid;uint256 sequence;uint256 oldL;uint256 oldS;uint256 nextL;uint256 nextS;bytes32 receipt;}
 struct Log {uint256 count;uint256 reserved;uint256 livePid;uint256 last;}
 struct Cursor {uint256 epoch;uint256 index;uint256 time;uint256 l;uint256 s;uint256 pid;uint256 le;uint256 se;}
 struct Exposure {uint256 le;uint256 se;}
 struct Total {uint256 le;uint256 se;M.Fraction debt;M.Fraction claim_;bool done;}
 mapping(uint256=>Config) public config;
 mapping(uint256=>Trace) public traces;
 mapping(bytes32=>Log) public logs;
 mapping(bytes32=>mapping(uint256=>Transition)) private history;
 // Max uint means reserved; an ordinal records consumption. Never deleted/recycled.
 mapping(uint256=>uint256) public finalOrdinal;
 mapping(bytes32=>Cursor) public cursors;
 mapping(bytes32=>mapping(uint256=>Total)) private totals;
 mapping(uint256=>mapping(uint256=>Exposure)) private positionExposure;
 event Registered(uint256 indexed domain,uint256 series,uint256 historyCap,uint256 batch);
 event Recorded(uint256 indexed domain,uint256 indexed pid,uint256 sequence,uint256 ordinal,bytes32 receipt);
 event AccountAttributed(bytes32 indexed accountKey,uint256 indexed epoch,uint256 le,uint256 se);
 constructor(address partial_) {
  if(block.chainid!=31337||partial_.code.length==0)revert Forbidden();partialSettlement=partial_;
  core=LocalFuturesCore(payable(IAttributionPartial(partial_).core()));funding=IAttributionPartial(partial_).funding();
  if(address(core).code.length==0||funding.code.length==0||core.localPartial()!=partial_||core.localFunding()!=funding||IAttributionFunding(funding).core()!=address(core))revert Forbidden();
 }
 function productionEnabled() external pure returns(bool){return false;}
 function accountKey(uint256 id,address who) public view returns(bytes32){Config storage c=config[id];return keccak256(abi.encode(address(this),partialSettlement,address(core),funding,id,c.sid,c.policy,who));}
 function registerDomain(uint256 id,uint256 historyCap,uint256 batch) external lock {
  LocalFuturesCore.Domain memory d=core.domain(id);IAttributionPartial p=IAttributionPartial(partialSettlement);
  (uint256 sid,bytes32 policy,uint256 l,uint256 s)=core.exposureBindings(id);
  (uint256[11] memory f,bytes32 fp)=IAttributionFunding(funding).fundingSeries(id,sid);
  // Explicit LOCAL technical envelope, not production defaults.
  if(msg.sender!=d.governor||p.attribution()!=address(this)||p.linkedCapacity(id)==0||p.researchTouched(id)||config[id].sid!=0||d.state!=LocalFuturesCore.State.Normal||d.accounted!=0||l+s!=0||sid==0||policy!=d.cfg.policyDigest||fp!=policy||block.timestamp>=f[0]||IAttributionFunding(funding).seriesInputMode(id,sid)!=2)revert Forbidden();
  if(historyCap<2||historyCap>256||batch==0||batch>32)revert Invalid();
  address registry=address(core.domainRegistry());if(registry!=address(0)&&id>IAttributionPreparationRegistry(registry).cutoff())IAttributionPreparationRegistry(registry).assertAttributionPreparation(id,historyCap,batch);
  config[id]=Config(sid,policy,f[0],f[1],f[2],historyCap,batch);emit Registered(id,sid,historyCap,batch);
 }
 function record(uint256 pid,uint256 oldL,uint256 oldS,bytes32 receipt) external lock {
  if(msg.sender!=partialSettlement||core.localPartial()!=partialSettlement||IAttributionPartial(partialSettlement).attribution()!=address(this))revert Forbidden();
  (address who,uint256[5] memory v,bytes32 policy)=core.coreExposureContext(pid);uint256 id=v[0];Config storage c=config[id];
  // Untouched legacy namespaces remain independent. Late enrollment is impossible.
  if(c.sid==0)return;
  if(who==address(0)||pid==0||v[1]!=c.sid||policy!=c.policy||block.timestamp<c.origin)revert Forbidden();
  bytes32 key=keccak256(abi.encode(address(core),funding,id,c.sid,who,pid,policy));
  if(IAttributionFunding(funding).coreExposureSequences(key)!=v[2]||receipt!=keccak256(abi.encode(key,v[2],block.timestamp,oldL,oldS,v[3],v[4])))revert Mismatch();
  (uint256 bound,bytes32 bp,uint256 gl,uint256 gs)=core.exposureBindings(id);
  (uint256[11] memory f,bytes32 fp)=IAttributionFunding(funding).fundingSeries(id,c.sid);
  uint256[4] memory a=IAttributionFunding(funding).fundingSeriesAccount(id,c.sid,who);
  if(bound!=c.sid||bp!=policy||fp!=policy||gl!=f[8]||gs!=f[9]||a[2]!=v[3]||a[3]!=v[4])revert Mismatch();
  bytes32 ak=accountKey(id,who);Log storage log=logs[ak];Trace storage t=traces[pid];uint256 next=v[3]+v[4];
  if(block.timestamp<log.last||(v[3]!=0&&v[4]!=0))revert Invalid();
  if(t.sequence==0){
   if(v[2]!=1||oldL+oldS!=0||next==0||log.livePid!=0||block.timestamp>=c.origin+c.length*c.epochs)revert Invalid();
   if(log.count+log.reserved+2>c.historyCap)revert Capacity();
   t.key=key;t.owner=who;t.domain=id;t.sid=c.sid;t.opened=block.timestamp;t.long_=v[3]!=0;
   log.reserved++;log.livePid=pid;finalOrdinal[pid]=type(uint256).max;
  }else{
   if(t.key!=key||t.owner!=who||t.domain!=id||t.sid!=c.sid||log.livePid!=pid||t.size==0||v[2]!=t.sequence+1||oldL!=(t.long_?t.size:0)||oldS!=(t.long_?0:t.size)||next>=t.size||(t.long_?v[4]!=0:v[3]!=0))revert Duplicate();
   if(next==0){if(finalOrdinal[pid]!=type(uint256).max||log.reserved==0)revert Duplicate();log.reserved--;log.livePid=0;finalOrdinal[pid]=log.count+1;}
   else if(log.count+log.reserved+1>c.historyCap)revert Capacity();
  }
  log.count++;log.last=block.timestamp;t.last=block.timestamp;t.size=next;t.sequence=v[2];
  if(log.count+log.reserved>c.historyCap)revert Capacity();
  history[ak][log.count]=Transition(block.timestamp,pid,v[2],oldL,oldS,v[3],v[4],receipt);
  emit Recorded(id,pid,v[2],log.count,receipt);
 }
 function _integrate(Cursor storage w,uint256 time) private {
  if(time<w.time)revert Invalid();uint256 dt=time-w.time;
  if(w.pid!=0){Exposure storage e=positionExposure[w.pid][w.epoch];uint256 l=w.l*dt;uint256 s=w.s*dt;e.le+=l;e.se+=s;w.le+=l;w.se+=s;}
  else if(w.l+w.s!=0)revert Mismatch();w.time=time;
 }
 function _rights(uint256 id,uint256 epoch,uint256 le,uint256 se) private view returns(M.Fraction memory debt,M.Fraction memory claim_) {
  Config storage c=config[id];(uint256[11] memory e,int256 n,uint256 d)=IAttributionFunding(funding).fundingSeriesEpoch(id,c.sid,epoch);
  if(e[10]<2||n<0||d==0)revert WrongState();bool longPays=e[3]>=e[4];uint256 payer=longPays?e[3]:e[4];uint256 receiver=longPays?e[4]:e[3];M.Fraction memory u=M.fraction(n,d);
  debt=payer==0?M.fraction(0,1):M.scaleFraction(u,longPays?le:se,payer);
  claim_=receiver==0?M.fraction(0,1):M.scaleFraction(u,longPays?se:le,receiver);
 }
 function _finish(uint256 id,address who,bytes32 ak,Cursor storage w) private {
  Config storage c=config[id];uint256[8] memory m=IAttributionFunding(funding).fundingSeriesMember(id,c.sid,w.epoch,who);
  if(w.le!=m[0]||w.se!=m[1]||(m[2]!=0&&m[3]!=1))revert Mismatch();
  (M.Fraction memory debt,M.Fraction memory claim_)=_rights(id,w.epoch,w.le,w.se);
  if(m[2]!=0){M.Fraction memory md=M.fraction(M.signed(m[4],false),m[5]);M.Fraction memory mc=M.fraction(M.signed(m[6],false),m[7]);if(md.n!=debt.n||md.d!=debt.d||mc.n!=claim_.n||mc.d!=claim_.d)revert Mismatch();}
  else if(w.le+w.se!=0||debt.n!=0||claim_.n!=0)revert Mismatch();
  Total storage total=totals[ak][w.epoch];if(total.done)revert Duplicate();
  total.le=w.le;total.se=w.se;total.debt=debt;total.claim_=claim_;total.done=true;
  // Linearity with these common frozen coefficients proves the exact sum of
  // position fractions equals the account's gross rights, without per-position rounding.
  emit AccountAttributed(ak,w.epoch,w.le,w.se);w.epoch++;w.le=0;w.se=0;
 }
 function processAccount(uint256 id,address who,uint256 limit) external lock {
  Config storage c=config[id];if(c.sid==0||limit==0||limit>c.batch)revert Invalid();bytes32 ak=accountKey(id,who);Log storage log=logs[ak];if(log.count==0)revert Invalid();
  Cursor storage w=cursors[ak];if(w.epoch==0){w.epoch=1;w.index=1;w.time=c.origin;}
  if(w.epoch>c.epochs)revert WrongState();
  for(uint256 i;i<limit&&w.epoch<=c.epochs;i++){
   (uint256[11] memory e,,)=IAttributionFunding(funding).fundingSeriesEpoch(id,c.sid,w.epoch);
   if(e[10]<2||block.timestamp<e[1]){if(i==0)revert WrongState();break;}
   Transition storage x=history[ak][w.index];
   if(w.index<=log.count&&x.timestamp<e[1]){
    _integrate(w,x.timestamp);if(w.l!=x.oldL||w.s!=x.oldS)revert Mismatch();
    w.l=x.nextL;w.s=x.nextS;w.pid=w.l+w.s==0?0:x.pid;w.index++;
   }else{_integrate(w,e[1]);_finish(id,who,ak,w);}
  }
 }
 function transition(uint256 id,address who,uint256 ordinal) external view returns(Transition memory){return history[accountKey(id,who)][ordinal];}
 function accountEpoch(uint256 id,address who,uint256 epoch) external view returns(Total memory){return totals[accountKey(id,who)][epoch];}
 function positionEpoch(uint256 pid,uint256 epoch) external view returns(uint256 le,uint256 se,M.Fraction memory debt,M.Fraction memory claim_){
  Trace storage t=traces[pid];if(t.sequence==0||!totals[accountKey(t.domain,t.owner)][epoch].done)revert WrongState();Exposure storage e=positionExposure[pid][epoch];le=e.le;se=e.se;(debt,claim_)=_rights(t.domain,epoch,le,se);
 }
}
