// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore,ILocalDomainRegistry} from "./LocalFuturesCore.sol";
import {IPartialFunding,ILocalAttribution,IPartialToken} from "./LocalFuturesPartialSettlement.sol";
import {ICollectionExecution,IRepeatPayoutExecutor} from "./LocalFuturesFunding.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
import {LocalFuturesLinkedExposureVerifier} from "./LocalFuturesLinkedExposureVerifier.sol";
import {LocalFuturesReleaseVerifier} from "./LocalFuturesReleaseVerifier.sol";
import {LocalFuturesWithdrawalVerifier} from "./LocalFuturesWithdrawalVerifier.sol";
import {LocalFuturesFundingV11 as WithdrawalFunding} from "./LocalFuturesFundingV11.sol";

/// @notice Fresh LOCAL 31337 custody. Protected withdrawals require an opt-in zero-debt policy; releases remain unconnected.
contract LocalFuturesPartialV11 {
 LocalFuturesCore public immutable core;
 address public immutable funding;
 uint256 public immutable legacyDomainCutoff;
 LocalFuturesWithdrawalVerifier public immutable withdrawalVerifier;
 bytes32 public immutable withdrawalVerifierCodeHash;
 LocalFuturesReleaseVerifier public immutable releaseVerifier;
 bytes32 public immutable releaseVerifierCodeHash;
 LocalFuturesLinkedExposureVerifier public immutable linkedExposureVerifier;
 bytes32 public immutable linkedExposureVerifierCodeHash;
 mapping(address=>uint256) public tokenAccounted;
 uint256 private entered;
 error Forbidden();error Invalid();error PolicyBlocked();error Insufficient();error TransferFailed();error Reentrant();error SettlementPending();
 modifier lock(){if(entered!=0)revert Reentrant();entered=1;_;entered=0;}
 constructor(address core_,address funding_,address release_,bytes32 approvedReleaseCodeHash,address linked_,bytes32 approvedLinkedCodeHash){
  if(block.chainid!=31337||core_.code.length==0||funding_.code.length==0)revert PolicyBlocked();
  core=LocalFuturesCore(payable(core_));funding=funding_;legacyDomainCutoff=core.domainCount();
  if(msg.sender!=core.governance()||IPartialFunding(funding_).core()!=core_||core.localFunding()!=funding_)revert Forbidden();
  LocalFuturesWithdrawalVerifier verifier=new LocalFuturesWithdrawalVerifier(core_,funding_,address(this));
  withdrawalVerifier=verifier;withdrawalVerifierCodeHash=address(verifier).codehash;
  LocalFuturesReleaseVerifier releaseModule=LocalFuturesReleaseVerifier(release_);
  if(release_.code.length==0||approvedReleaseCodeHash==bytes32(0)||release_.codehash!=approvedReleaseCodeHash||address(releaseModule.core())!=core_||releaseModule.funding()!=funding_||releaseModule.partialSettlement()!=address(this))revert Forbidden();
  releaseVerifier=releaseModule;releaseVerifierCodeHash=approvedReleaseCodeHash;
  LocalFuturesLinkedExposureVerifier linkedModule=LocalFuturesLinkedExposureVerifier(linked_);if(linked_.code.length==0||approvedLinkedCodeHash==bytes32(0)||linked_.codehash!=approvedLinkedCodeHash||address(linkedModule.core())!=core_||linkedModule.funding()!=funding_||linkedModule.partialSettlement()!=address(this))revert Forbidden();linkedExposureVerifier=linkedModule;linkedExposureVerifierCodeHash=approvedLinkedCodeHash;
 }
 function productionEnabled() external pure returns(bool){return false;}
 function settlementCompletionConnected() external pure returns(bool){return false;}
 function _domain(uint256 id) private view returns(LocalFuturesCore.Domain memory d){d=core.domain(id);if(d.state==LocalFuturesCore.State.Unset)revert Invalid();}
 function _gov(LocalFuturesCore.Domain memory d) private view {if(msg.sender!=d.governor)revert Forbidden();}
 function _registryGuard(uint256 id) private view {address r=address(core.domainRegistry());if(r!=address(0)){ILocalDomainRegistry registry=ILocalDomainRegistry(r);if(id<=registry.cutoff())registry.assertLegacyDomain(id);else registry.assertOperation(id,msg.sig);}}
 function registryGuardVersion() external pure returns(uint256){return 1;}
 struct PartialPool {uint256 cash;uint256 lp;uint256 locked;uint256 free;uint256 pnl;uint256 funding;uint256 refund;uint256 fees;uint256 oi;uint256 active;uint256 base;uint256 shorts;}
 mapping(uint256=>PartialPool) private partialPools;
 mapping(uint256=>bool) public lpEnabled;
 mapping(uint256=>bool) public researchTouched;
 mapping(uint256=>uint256) public lpTotalShares;
 mapping(uint256=>mapping(address=>uint256)) public lpShares;
 event ResearchLPEnabled(uint256 indexed id);
 event ResearchLPDeposited(uint256 indexed id,address indexed owner,uint256 assets,uint256 shares);
 event ResearchLPRedeemed(uint256 indexed id,address indexed owner,uint256 shares,uint256 assets);
 function partialPool(uint256 id) external view returns(uint256[12] memory v){PartialPool storage p=partialPools[id];return [p.cash,p.lp,p.locked,p.free,p.pnl,p.funding,p.refund,p.fees,p.oi,p.active,p.base,p.shorts];}
 function _partialPull(LocalFuturesCore.Domain memory d,uint256 amount) private {if(amount==0||amount>1e36)revert Invalid();IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));if(!t.transferFrom(msg.sender,address(this),amount)||t.balanceOf(address(this))-before_!=amount)revert TransferFailed();tokenAccounted[d.token]+=amount;}

 function lpObligationStatus(uint256 id) public view returns(bool clear,uint256[8] memory v){
 LocalFuturesCore.Domain memory d=_domain(id);PartialPool storage pool=partialPools[id];
 // Completion is unconnected: any position history blocks LP reuse/redemption.
 v=[linkedPending[id],linkedFinalReserved[id],uint256(0),uint256(0),pool.free+pool.pnl+pool.funding,pool.locked,pool.refund,researchTouched[id]?1:0];
 clear=d.state==LocalFuturesCore.State.Normal&&pool.oi==0&&pool.active==0&&pool.base==0&&pool.shorts==0&&IPartialToken(d.token).balanceOf(address(this))>=tokenAccounted[d.token]&&linkedHeld[id]==0;
 for(uint256 i;i<8;i++)if(v[i]!=0)clear=false;
 }
 function _lpReady(uint256 id) private view {
        (bool clear,)=lpObligationStatus(id);LocalFuturesCore.Domain memory d=_domain(id);
        // The original Core is a different custody path, never a source of LP assets.
        if(!clear||d.accounted!=0||d.oi!=0||d.active!=0||d.unprocessed!=0||d.recoveryId!=0)revert PolicyBlocked();
        PartialPool storage p=partialPools[id];
        if(p.cash!=p.lp+p.locked+p.free+p.pnl+p.funding+p.refund+p.fees+linkedHeld[id])revert Insufficient();
    }
 function enableResearchLP(uint256 id) external lock {
 _registryGuard(id);LocalFuturesCore.Domain memory d=_domain(id);_gov(d);_lpReady(id);
 if(id<=legacyDomainCutoff||lpEnabled[id]||researchTouched[id]||partialPools[id].cash!=0)revert PolicyBlocked();
 lpEnabled[id]=true;emit ResearchLPEnabled(id);
 }
 function depositResearchLP(uint256 id,uint256 assets,uint256 minShares) external lock returns(uint256 shares){
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);_lpReady(id);PartialPool storage p=partialPools[id];
        uint256 supply=lpTotalShares[id];uint256 nav=p.lp;
        if(!lpEnabled[id]||(supply==0)!=(nav==0))revert PolicyBlocked();
        if(assets==0||assets>1e36||nav>1e36-assets)revert Invalid();
        shares=supply==0?assets*10**(18-d.decimals_):M.mulDiv(assets,supply,nav,false);
        if(shares==0||shares<minShares)revert Insufficient();
        _partialPull(d,assets);p.cash+=assets;p.lp+=assets;lpTotalShares[id]=supply+shares;lpShares[id][msg.sender]+=shares;
        _lpReady(id);emit ResearchLPDeposited(id,msg.sender,assets,shares);
    }
 function redeemResearchLP(uint256 id,uint256 shares,uint256 minAssets) external lock returns(uint256 assets){
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);_lpReady(id);PartialPool storage p=partialPools[id];
        uint256 supply=lpTotalShares[id];
        if(!lpEnabled[id]||supply==0||p.lp==0)revert PolicyBlocked();
        if(shares==0||shares>lpShares[id][msg.sender])revert Insufficient();
        assets=M.mulDiv(shares,p.lp,supply,false);if(assets==0||assets<minAssets)revert Insufficient();
        IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 toBefore=t.balanceOf(msg.sender);
        lpShares[id][msg.sender]-=shares;lpTotalShares[id]-=shares;p.lp-=assets;p.cash-=assets;tokenAccounted[d.token]-=assets;
        if(!t.transfer(msg.sender,assets)||before_-t.balanceOf(address(this))!=assets||t.balanceOf(msg.sender)-toBefore!=assets)revert TransferFailed();
        _lpReady(id);emit ResearchLPRedeemed(id,msg.sender,shares,assets);
    }
    struct LinkedBasis {bytes32 key;uint256 initialSize;uint256 margin;uint256 closed;uint256 held;uint256 sequence;uint256 partials;uint256 entry;}
    struct LinkedExit {uint256 status;uint256 timestamp;uint256 heldDelta;uint256 closed;uint256 market;uint256 collateral;uint256 marketTime;uint256 collateralTime;uint256 cutoff;uint256 epoch;bytes32 receipt;}
    mapping(uint256=>uint256) public linkedCapacity;
    mapping(uint256=>uint256) public linkedHeld;
    mapping(uint256=>uint256) public linkedPending;
    mapping(uint256=>uint256) public linkedFinalReserved;
    mapping(uint256=>LinkedBasis) private linkedBases;
    mapping(uint256=>LinkedExit) private linkedFinal;
    mapping(uint256=>mapping(uint256=>LinkedExit)) private linkedPartials;
    event LinkedConfigured(uint256 indexed domain,uint256 partialCapacity);
    event LinkedHeld(uint256 indexed domain,uint256 indexed positionId,uint256 sequence,uint256 amount,bool final_);
 function _linkedVerifier() private view returns(LocalFuturesLinkedExposureVerifier module){module=linkedExposureVerifier;if(address(module).codehash!=linkedExposureVerifierCodeHash||address(module.core())!=address(core)||module.funding()!=funding||module.partialSettlement()!=address(this))revert PolicyBlocked();}
 function configureLinkedResearch(uint256 id,uint256 capacity) external lock {
  _registryGuard(id);LocalFuturesCore.Domain memory d=_domain(id);_gov(d);PartialPool storage pool=partialPools[id];
  if(id<=legacyDomainCutoff||capacity==0||capacity>d.cfg.maxBatch||linkedCapacity[id]!=0||researchTouched[id]||pool.cash!=pool.lp)revert PolicyBlocked();_linkedVerifier().validateConfiguration(id);linkedCapacity[id]=capacity;emit LinkedConfigured(id,capacity);
 }
 function recordLinkedExposure(uint256 pid,uint256 margin,bytes32 receipt,uint256 oldL,uint256 oldS) external lock {
  (address owner,uint256[5] memory v,)=core.coreExposureContext(pid);_registryGuard(v[0]);if(msg.sender!=address(core))revert Forbidden();if(linkedCapacity[v[0]]==0)revert PolicyBlocked();
  LocalFuturesLinkedExposureVerifier module=_linkedVerifier();LocalFuturesLinkedExposureVerifier.Quote memory q=module.quote(pid,margin,receipt,oldL,oldS);
  if(q.pid!=pid||q.owner!=owner||q.domain!=v[0]||q.sequence!=v[2]||q.remaining!=v[3]+v[4])revert Forbidden();
  uint256 id=q.domain;LocalFuturesCore.Domain memory d=_domain(id);PartialPool storage pool=partialPools[id];LinkedBasis storage b=linkedBases[pid];
  if(b.initialSize==0){
   if(margin==0||margin>1e36||q.sequence!=1||q.remaining==0)revert Invalid();b.key=q.key;b.initialSize=q.remaining;b.margin=margin;b.sequence=q.sequence;b.entry=q.pm;
   linkedFinal[pid].status=1;linkedFinalReserved[id]++;linkedPending[id]++;researchTouched[id]=true;
   IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));if(!t.transferFrom(owner,address(this),margin)||t.balanceOf(address(this))-before_!=margin)revert TransferFailed();
   tokenAccounted[d.token]+=margin;pool.cash+=margin;pool.locked+=margin;pool.active++;pool.oi+=q.remaining;pool.base=q.base;pool.shorts=q.shorts;
  }else{
   if(q.key!=b.key||margin!=0||q.sequence!=b.sequence+1||q.closed<=b.closed||q.closed>b.initialSize||q.held<b.held||q.held>b.margin||q.delta!=q.held-b.held||q.quantity!=q.closed-b.closed||q.remaining!=b.initialSize-q.closed)revert Invalid();
   if(q.remaining!=0)b.partials++;
   LinkedExit storage e=q.remaining==0?linkedFinal[pid]:linkedPartials[pid][q.sequence];e.status=q.remaining==0?2:3;e.timestamp=block.timestamp;e.heldDelta=q.delta;e.closed=q.closed;e.market=q.pm;e.collateral=q.pc;e.marketTime=q.tm;e.collateralTime=q.tc;e.cutoff=q.cutoff;e.epoch=q.epoch;e.receipt=receipt;
   pool.locked-=q.delta;linkedHeld[id]+=q.delta;pool.oi-=q.quantity;b.closed=q.closed;b.held=q.held;b.sequence=q.sequence;
   if(q.remaining==0){pool.active--;linkedFinalReserved[id]--;}
   pool.base=q.base;pool.shorts=q.shorts;
   if(q.remaining!=0)module.checkMaintenance(pid,q.pc);emit LinkedHeld(id,pid,q.sequence,q.delta,q.remaining==0);
  }
  if(pool.oi!=q.expectedOi||pool.cash!=pool.lp+pool.locked+linkedHeld[id]+pool.free+pool.pnl+pool.funding+pool.refund+pool.fees||IPartialToken(d.token).balanceOf(address(this))<tokenAccounted[d.token])revert Insufficient();
  module.checkRisk(id,q.pm,q.pc);if(attribution!=address(0))ILocalAttribution(attribution).record(pid,oldL,oldS,receipt);
 }
 function linkedBasis(uint256 pid) external view returns(LinkedBasis memory){return linkedBases[pid];}
 function linkedExit(uint256 pid,uint256 sequence,bool final_) external view returns(LinkedExit memory){return final_?linkedFinal[pid]:linkedPartials[pid][sequence];}
 address public attribution;
 function bindAttribution(address module) external lock {
 if(address(core.domainRegistry())!=address(0))revert PolicyBlocked();

        if(msg.sender!=core.governance()||attribution!=address(0)||module.code.length==0)revert Forbidden();
        if(ILocalAttribution(module).core()!=address(core)||ILocalAttribution(module).funding()!=funding||ILocalAttribution(module).partialSettlement()!=address(this))revert Invalid();
        attribution=module;
    }
 mapping(uint256=>uint256) public linkedConsumed;
 function applyCollection(uint256 pid,uint256 id,uint256 pnl,uint256 amount,uint256 fee,bytes32 accountKey,bytes32 epochKey,uint256 accountLimit) external lock {
 _registryGuard(id);

  address executor_=IPartialFunding(funding).collectionExecutor();
  if(msg.sender!=executor_||ICollectionExecution(executor_).partialAuthorization()!=keccak256(msg.data))revert Forbidden();
  LocalFuturesCore.Domain memory d=_domain(id);uint256 spent=linkedConsumed[pid]+pnl+amount+fee;
  if(releases[pid].completion!=bytes32(0)||spent+releases[pid].released>linkedBases[pid].held)revert SettlementPending();
  if(d.state!=LocalFuturesCore.State.Normal||pnl+amount+fee==0||linkedBases[pid].closed!=linkedBases[pid].initialSize||spent>linkedBases[pid].held)revert Invalid();
  IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 destination=t.balanceOf(funding);
  if(before_<tokenAccounted[d.token])revert TransferFailed();
  if(amount!=0){
   if(!t.approve(funding,amount))revert TransferFailed();
   IPartialFunding(funding).collectRepeat(id,accountKey,epochKey,amount,accountLimit);
   if(!t.approve(funding,0))revert TransferFailed();
  }
  if(before_-t.balanceOf(address(this))!=amount||t.balanceOf(funding)-destination!=amount)revert TransferFailed();
  PartialPool storage pool=partialPools[id];linkedHeld[id]-=pnl+amount+fee;pool.lp+=pnl;pool.fees+=fee;pool.cash-=amount;tokenAccounted[d.token]-=amount;linkedConsumed[pid]=spent;
  if(pool.cash!=pool.lp+pool.locked+linkedHeld[id]+pool.free+pool.pnl+pool.funding+pool.refund+pool.fees)revert Insufficient();
 }
 mapping(bytes32=>bool) private repeatReceiptReceived;
 mapping(bytes32=>uint256) private repeatFundingReceived;
 mapping(uint256=>uint256) private repeatFundingProtected;
 function repeatReceiptState(uint256 id,bytes32 rightsKey,bytes32 receipt) external view returns(uint256 received,uint256 protectedAmount,bool consumed){
  return(repeatFundingReceived[rightsKey],repeatFundingProtected[id],repeatReceiptReceived[receipt]);
 }
 function receiveRepeatFunding(uint256 id,bytes32 preparation,uint256 sequence,uint256 amount) external lock returns(bytes32 receipt){
  _registryGuard(id);
  LocalFuturesCore.Domain memory d=_domain(id);if(d.state!=LocalFuturesCore.State.Normal||amount==0)revert PolicyBlocked();
  address module=IPartialFunding(funding).payoutExecutor();if(module==address(0))revert Forbidden();
  IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 source=t.balanceOf(funding);if(before_<tokenAccounted[d.token])revert Insufficient();
  uint256 cumulative;(receipt,cumulative)=IPartialFunding(funding).payRepeat(id,msg.sender,preparation,sequence,amount);
  (bytes32 rightsKey,uint256 limit)=IRepeatPayoutExecutor(module).validateReceipt(id,msg.sender,preparation,sequence,amount,receipt,cumulative);
  if(repeatReceiptReceived[receipt]||cumulative!=repeatFundingReceived[rightsKey]+amount||cumulative>limit||t.balanceOf(address(this))-before_!=amount||source-t.balanceOf(funding)!=amount)revert TransferFailed();
  repeatReceiptReceived[receipt]=true;repeatFundingReceived[rightsKey]=cumulative;repeatFundingProtected[id]+=amount;PartialPool storage pool=partialPools[id];pool.funding+=amount;pool.cash+=amount;tokenAccounted[d.token]+=amount;
  if(pool.cash!=pool.lp+pool.locked+linkedHeld[id]+pool.free+pool.pnl+pool.funding+pool.refund+pool.fees)revert Insufficient();
  emit RepeatFundingReceived(receipt,id,msg.sender,sequence,amount,cumulative);
 }
 event RepeatFundingReceived(bytes32 indexed receipt,uint256 indexed domain,address indexed account,uint256 sequence,uint256 amount,uint256 cumulative);
 // Reserved official namespaces, not calculated entitlements or permission to execute.
 struct Withdrawal {uint256 paid;uint256 sequence;}
 struct Release {uint256 released;uint256 sequence;bytes32 completion;}
 mapping(bytes32=>Withdrawal) public withdrawals;
 mapping(uint256=>Release) public releases;
 // Append-only: roots 0..20 and all existing structs retain their original layout.
 mapping(uint256=>bytes32) public protectedWithdrawalPolicy;
 mapping(uint256=>uint256) public protectedWithdrawn;
 mapping(bytes32=>bytes32) public protectedWithdrawalReceipts;
 event ProtectedWithdrawalConfigured(uint256 indexed domain,bytes32 context);
 event ProtectedWithdrawn(bytes32 indexed receipt,uint256 indexed domain,address indexed account,bytes32 rightsKey,uint256 sequence,uint256 amount,uint256 cumulative);
 function _withdrawalContext(uint256 id) private view returns(bytes32){
  LocalFuturesWithdrawalVerifier verifier=withdrawalVerifier;
  if(address(verifier).code.length==0||address(verifier).codehash!=withdrawalVerifierCodeHash||address(verifier.core())!=address(core)||verifier.funding()!=funding||verifier.partialSettlement()!=address(this))revert SettlementPending();
  return verifier.context(id);
 }
 function configureProtectedWithdrawal(uint256 id) external lock {
  _registryGuard(id);LocalFuturesCore.Domain memory d=_domain(id);_gov(d);
  WithdrawalFunding f=WithdrawalFunding(funding);(WithdrawalFunding.RepeatPayoutEpoch memory e,,)=f.repeatPayoutState(id,bytes32(0),bytes32(0));
  if(id<=legacyDomainCutoff||protectedWithdrawalPolicy[id]!=bytes32(0)||researchTouched[id]||lpEnabled[id]||partialPools[id].cash!=0||d.accounted!=0||d.oi!=0||d.active!=0||d.unprocessed!=0||e.started||f.payoutExecutor().code.length==0)revert SettlementPending();
  bytes32 context=_withdrawalContext(id);protectedWithdrawalPolicy[id]=context;emit ProtectedWithdrawalConfigured(id,context);
 }
 function protectedWithdrawalState(uint256 id,bytes32 key) external view returns(uint256 received,uint256 paid,uint256 available,uint256 domainAvailable,uint256 sequence){
  received=repeatFundingReceived[key];Withdrawal storage w=withdrawals[key];paid=w.paid;available=received-paid;domainAvailable=repeatFundingProtected[id]-protectedWithdrawn[id];sequence=w.sequence;
 }
 function withdrawProtected(uint256 id,bytes32 key,uint256 sequence,uint256 amount) external lock {
  _registryGuard(id);if(protectedWithdrawalPolicy[id]==bytes32(0)||protectedWithdrawalPolicy[id]!=_withdrawalContext(id)||amount==0)revert SettlementPending();
  LocalFuturesWithdrawalVerifier.Authorization memory auth=withdrawalVerifier.validateWithdrawal(id,msg.sender,key);
  WithdrawalFunding f=WithdrawalFunding(funding);(,WithdrawalFunding.RepeatPayoutAccount memory account,)=f.repeatPayoutState(id,key,bytes32(0));
  if(auth.account!=msg.sender||auth.domain!=id||auth.context!=protectedWithdrawalPolicy[id]||auth.rightsKey!=key||auth.preparation!=account.preparation||auth.cumulativeCeiling!=account.paid||account.paid!=repeatFundingReceived[key]||account.paid>account.limit)revert SettlementPending();
  Withdrawal storage w=withdrawals[key];LocalFuturesCore.Domain memory d=_domain(id);PartialPool storage p=partialPools[id];
  if(sequence!=w.sequence+1||w.paid+amount>auth.cumulativeCeiling||amount>repeatFundingReceived[key]-w.paid||amount>repeatFundingProtected[id]-protectedWithdrawn[id]||amount>p.funding)revert Insufficient();
  IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 destination=t.balanceOf(msg.sender);if(before_<tokenAccounted[d.token])revert Insufficient();
  bytes32 receipt=keccak256(abi.encode("V11_PROTECTED_WITHDRAWAL",block.chainid,address(this),funding,id,msg.sender,key,sequence));
  if(protectedWithdrawalReceipts[receipt]!=bytes32(0))revert Forbidden();
  w.paid+=amount;w.sequence=sequence;protectedWithdrawn[id]+=amount;p.funding-=amount;
  protectedWithdrawalReceipts[receipt]=keccak256(abi.encode(protectedWithdrawalPolicy[id],d.token,key,sequence,amount,w.paid));
  _transferUser(id,d,p,amount,before_,destination);
  emit ProtectedWithdrawn(receipt,id,msg.sender,key,sequence,amount,w.paid);
 }
 // Caller owns rights, bucket, sequence and receipts; recipient is always msg.sender.
 function _transferUser(uint256 id,LocalFuturesCore.Domain memory d,PartialPool storage p,uint256 amount,uint256 before_,uint256 destination) private {
  p.cash-=amount;tokenAccounted[d.token]-=amount;IPartialToken t=IPartialToken(d.token);
  if(!t.transfer(msg.sender,amount)||before_-t.balanceOf(address(this))!=amount||t.balanceOf(msg.sender)-destination!=amount)revert TransferFailed();
  if(p.cash!=p.lp+p.locked+linkedHeld[id]+p.free+p.pnl+p.funding+p.refund+p.fees||t.balanceOf(address(this))<tokenAccounted[d.token])revert Insufficient();
 }
 mapping(uint256=>bytes32) public heldReleasePolicy;
 mapping(uint256=>mapping(address=>uint256)) public releasedReturnAvailable;
 mapping(bytes32=>bytes32) public heldReleaseReceipts;
 event HeldReleaseConfigured(uint256 indexed domain,bytes32 context);
 event HeldReleased(bytes32 indexed receipt,uint256 indexed pid,address indexed account,uint256 domain,uint256 sequence,uint256 amount,bytes32 completion);
 function _releaseContext(uint256 id) private view returns(bytes32){
  LocalFuturesReleaseVerifier verifier=releaseVerifier;if(address(verifier).codehash!=releaseVerifierCodeHash||address(verifier.core())!=address(core)||verifier.funding()!=funding||verifier.partialSettlement()!=address(this))revert SettlementPending();return verifier.context(id);
 }
 function configureHeldRelease(uint256 id) external lock {
  _registryGuard(id);LocalFuturesCore.Domain memory d=_domain(id);_gov(d);
  if(id<=legacyDomainCutoff||heldReleasePolicy[id]!=bytes32(0)||researchTouched[id]||lpEnabled[id]||partialPools[id].cash!=0||d.accounted!=0||d.oi!=0||d.active!=0||d.unprocessed!=0)revert SettlementPending();
  bytes32 context=_releaseContext(id);heldReleasePolicy[id]=context;emit HeldReleaseConfigured(id,context);
 }
 function releaseExitHeld(uint256 pid,uint256 sequence,bytes32 expectedCompletion,uint256 amount) external lock {
  (address who,uint256[5] memory v,)=core.coreExposureContext(pid);uint256 id=v[0];_registryGuard(id);if(msg.sender!=who)revert Forbidden();
  if(heldReleasePolicy[id]==bytes32(0)||heldReleasePolicy[id]!=_releaseContext(id))revert SettlementPending();
  LocalFuturesReleaseVerifier.Authorization memory auth=releaseVerifier.validateRelease(pid,msg.sender);Release storage r=releases[pid];LinkedBasis storage b=linkedBases[pid];
  if(auth.account!=msg.sender||auth.domain!=id||auth.pid!=pid||auth.finalSequence!=v[2]||auth.finalSequence!=b.sequence||auth.policyContext!=heldReleasePolicy[id]||auth.completion!=expectedCompletion||expectedCompletion==bytes32(0)||r.completion!=bytes32(0)||sequence!=r.sequence+1||amount==0||amount!=auth.amount||amount!=b.held-linkedConsumed[pid]-r.released)revert SettlementPending();
  LocalFuturesCore.Domain memory d=_domain(id);IPartialToken t=IPartialToken(d.token);uint256 balance=t.balanceOf(address(this));uint256 accounted=tokenAccounted[d.token];PartialPool storage p=partialPools[id];uint256 cash=p.cash;if(balance<accounted)revert Insufficient();
  bytes32 receipt=keccak256(abi.encode("V11_HELD_RELEASE",block.chainid,address(this),funding,id,msg.sender,pid,sequence));if(heldReleaseReceipts[receipt]!=bytes32(0))revert Forbidden();
  linkedHeld[id]-=amount;p.free+=amount;releasedReturnAvailable[id][msg.sender]+=amount;r.released+=amount;r.sequence=sequence;r.completion=expectedCompletion;linkedPending[id]--;heldReleaseReceipts[receipt]=keccak256(abi.encode(expectedCompletion,amount,r.released));
  if(p.cash!=cash||tokenAccounted[d.token]!=accounted||t.balanceOf(address(this))!=balance||p.cash!=p.lp+p.locked+linkedHeld[id]+p.free+p.pnl+p.funding+p.refund+p.fees)revert Insufficient();emit HeldReleased(receipt,pid,msg.sender,id,sequence,amount,expectedCompletion);
 }

 // Append-only return withdrawal namespace; independent of Funding protection withdrawals.
 mapping(uint256=>mapping(address=>Withdrawal)) public returnWithdrawals;
 mapping(bytes32=>bytes32) public returnWithdrawalReceipts;
 event ReleasedReturnWithdrawn(bytes32 indexed receipt,uint256 indexed domain,address indexed account,uint256 sequence,uint256 amount,uint256 cumulative);
 function withdrawReleasedReturn(uint256 id,uint256 sequence,uint256 amount) external lock {
  _registryGuard(id);bytes32 context=heldReleasePolicy[id];
  if(context==bytes32(0)||context!=_releaseContext(id)||amount==0)revert SettlementPending();
  LocalFuturesCore.Domain memory d=_domain(id);if(d.state!=LocalFuturesCore.State.Normal)revert PolicyBlocked();
  PartialPool storage p=partialPools[id];Withdrawal storage w=returnWithdrawals[id][msg.sender];
  if(sequence!=w.sequence+1||amount>releasedReturnAvailable[id][msg.sender]||amount>p.free)revert Insufficient();
  IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 destination=t.balanceOf(msg.sender);if(before_<tokenAccounted[d.token])revert Insufficient();
  bytes32 receipt=keccak256(abi.encode("V11_RETURN_WITHDRAWAL",block.chainid,address(this),funding,id,msg.sender,sequence));if(returnWithdrawalReceipts[receipt]!=bytes32(0))revert Forbidden();
  releasedReturnAvailable[id][msg.sender]-=amount;p.free-=amount;w.paid+=amount;w.sequence=sequence;
  returnWithdrawalReceipts[receipt]=keccak256(abi.encode(context,d.token,sequence,amount,w.paid));
  _transferUser(id,d,p,amount,before_,destination);
  emit ReleasedReturnWithdrawn(receipt,id,msg.sender,sequence,amount,w.paid);
 }
}
