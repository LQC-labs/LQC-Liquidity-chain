// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesPartialStudyLedger} from "./LocalFuturesPartialStudyLedger.sol";
import {LocalFuturesCore, ILocalDomainRegistry} from "./LocalFuturesCore.sol";
import {ICollectionExecution,IRepeatPayoutExecutor} from "./LocalFuturesFunding.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface IPartialFunding {
 function core() external view returns(address);
 function collectionExecutor() external view returns(address);
 function collectRepeat(uint256,bytes32,bytes32,uint256,uint256) external;
 function payoutExecutor() external view returns(address);
 function payRepeat(uint256,address,bytes32,uint256,uint256) external returns(bytes32,uint256);
 function fundingSeries(uint256,uint256) external view returns(uint256[11] memory,bytes32);
 function coreExposureSequences(bytes32) external view returns(uint256);
 function fundingStudy(uint256) external view returns(uint256[18] memory,bytes32,bool);
 function fundingObligations(uint256) external view returns(bool,uint256[10] memory);
 function closePartialReservation(uint256,address,uint256,uint256,uint256) external;
 function partialBasis(uint256,address) external view returns(uint256,uint256);
 function reservePartial(uint256,address,uint256,uint256) external returns(uint256,uint256);
 function partialTransfer(uint256,address,uint256,uint256,uint256,uint256,uint256) external;
}
interface ILocalAttribution {
 function core() external view returns(address);
 function funding() external view returns(address);
 function partialSettlement() external view returns(address);
 function record(uint256,uint256,uint256,bytes32) external;
}
interface IPartialToken {
 function transfer(address,uint256) external returns(bool);
 function balanceOf(address) external view returns(uint256);
 function transferFrom(address,address,uint256) external returns(bool);
 function approve(address,uint256) external returns(bool);
}
/// @notice LOCAL research custody only. No existing Core positions, Vault or live activation. LP shares are nontransferable LOCAL research only.
interface ILocalFuturesPartialSettlementOperationRegistry {function assertOperation(uint256,bytes4) external view;}
contract LocalFuturesPartialSettlement {
 LocalFuturesCore public immutable core;
 address public immutable funding;
 LocalFuturesPartialStudyLedger public immutable studyLedger;
 uint256 public immutable legacyDomainCutoff;
 mapping(address=>uint256) public tokenAccounted;
 uint256 public partialPositionCount;
 uint256 private entered;
 error Forbidden();error Invalid();error PolicyBlocked();error Insufficient();error TransferFailed();error Reentrant();
 modifier lock(){if(entered!=0)revert Reentrant();entered=1;_;entered=0;}
 constructor(address core_,address funding_){
  if(block.chainid!=31337||core_.code.length==0||funding_.code.length==0)revert PolicyBlocked();
  core=LocalFuturesCore(payable(core_));funding=funding_;legacyDomainCutoff=core.domainCount();
  if(core.localFunding()!=funding_||IPartialFunding(funding_).core()!=core_)revert Invalid();
  LocalFuturesPartialStudyLedger ledger=new LocalFuturesPartialStudyLedger(core_,funding_,address(this));
  if(address(ledger.core())!=core_||ledger.funding()!=funding_||ledger.partialSettlement()!=address(this))revert Invalid();
  studyLedger=ledger;
 }
 function productionEnabled() external pure returns(bool){return false;}
 function _domain(uint256 id) private view returns(LocalFuturesCore.Domain memory d){
  if(core.localPartial()!=address(this))revert Forbidden();d=core.domain(id);if(d.state==LocalFuturesCore.State.Unset)revert Invalid();
 }
 function _gov(LocalFuturesCore.Domain memory d) private view {if(msg.sender!=d.governor)revert Forbidden();}
    // Separate bounded LOCAL study. Existing positions, recovery, Vault and reducePosition never call it.
    // One study per domain/account; only a finalized Funding epoch. No new live policy defaults.
    struct PartialPool {uint256 cash;uint256 lp;uint256 locked;uint256 free;uint256 pnl;uint256 funding;uint256 refund;uint256 fees;uint256 oi;uint256 active;uint256 base;uint256 shorts;}
    struct PartialStudy {uint256 positionId;uint256 size;uint256 margin;uint256 closed;uint256 entry;uint256 collateral;uint256 debt;uint256 claim;uint256 released;uint256 lossCharged;uint256 lossFloor;uint256 gain;uint256 fundingPaid;uint256 fundingCredit;uint256 fee;uint256 sequence;bool long_;M.Fraction gains;M.Fraction losses;}
    mapping(uint256=>PartialPool) private partialPools;
    // Reserved legacy storage: never migrated, reset or used as a second source of rights.
    mapping(uint256=>mapping(address=>PartialStudy)) private partialStudies;
    event ResearchReduction(uint256 indexed domain,address indexed account,uint256 sequence,uint256 closed,uint256 pnlGain,uint256 pnlLoss,uint256 fundingDebt,uint256 fundingClaim);
    function partialFractions(uint256 id,address who) external view returns(int256,uint256,int256,uint256){return studyLedger.fractions(id,who);}
    function partialPool(uint256 id) external view returns(uint256[12] memory v){PartialPool storage p=partialPools[id];return [p.cash,p.lp,p.locked,p.free,p.pnl,p.funding,p.refund,p.fees,p.oi,p.active,p.base,p.shorts];}
    function partialProgress(uint256 id,address who) external view returns(uint256[12] memory v){return studyLedger.progress(id,who);}
    function fundPartialResearch(uint256 id,uint256 amount) external lock {
 _registryGuard(id);
LocalFuturesCore.Domain memory d=_domain(id);_gov(d);if(lpEnabled[id]||linkedCapacity[id]!=0)revert PolicyBlocked();researchTouched[id]=true;_partialPull(d,amount);partialPools[id].cash+=amount;partialPools[id].lp+=amount;}
    function _partialPull(LocalFuturesCore.Domain memory d,uint256 amount) private {if(amount==0||amount>1e36)revert Invalid();IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));if(!t.transferFrom(msg.sender,address(this),amount)||t.balanceOf(address(this))-before_!=amount)revert TransferFailed();tokenAccounted[d.token]+=amount;}
    function openPartialResearch(uint256 id,uint256 size,uint256 margin,bool long_) external lock {
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);if(linkedCapacity[id]!=0||d.state!=LocalFuturesCore.State.Normal||funding==address(0)||!d.cfg.fundingPolicyReady)revert PolicyBlocked();PartialPool storage pool=partialPools[id];
        if(size<d.cfg.minOrder||size>d.cfg.maxOrder||size>d.cfg.maxPosition||pool.oi+size>d.cfg.maxOI||pool.active>=d.cfg.maxPositions||margin==0||margin>1e36)revert Invalid();
        (uint256 pm,uint256 pc,,)=core.observe(id);uint256 positionId=++partialPositionCount;(uint256 debt,uint256 claim)=IPartialFunding(funding).reservePartial(id,msg.sender,positionId,1);
        studyLedger.open(id,msg.sender,positionId,size,margin,long_,pm,pc,debt,claim);
        researchTouched[id]=true;obligations[id].unprocessed++;obligations[id].activeReservations++;
        _partialPull(d,margin);pool.cash+=margin;pool.locked+=margin;pool.oi+=size;pool.active++;if(long_)pool.base+=M.mulDiv(size,1e27,pm,true);else pool.shorts+=size;_partialRisk(d,pool,pm,pc);
    }
    function _partialRisk(LocalFuturesCore.Domain memory d,PartialPool storage pool,uint256 pm,uint256 pc) private view {
        uint256 need=M.mulDiv(pool.base,pm,1e27,true)+pool.shorts+d.cfg.bufferUsd+M.mulDiv(pool.oi,d.cfg.stressBps,10000,true)+pool.active*d.cfg.liquidationCostUsd;
        if(M.usd18(pool.lp,pc,d.decimals_)<need)revert Insufficient();
    }
    function reducePartialResearch(uint256 id,uint256 quantity,uint256 sequence) external lock {
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);PartialPool storage pool=partialPools[id];
        (uint256 pm,uint256 pc,,)=core.observe(id);
        IPartialFunding(funding).partialBasis(id,msg.sender);
        uint256[18] memory v=studyLedger.reduce(id,msg.sender,quantity,sequence,pm,pc);
        if(v[7]>pool.lp)revert Insufficient();
        pool.lp=pool.lp+v[8]-v[7];pool.refund=pool.refund+v[9]-v[10];pool.pnl+=v[7];pool.fees+=v[11];pool.free+=v[6]-v[12];pool.locked-=v[6];
        pool.oi-=quantity;if(v[17]&16!=0)pool.base-=v[16];else pool.shorts-=quantity;if(v[15]==0)pool.active--;
        IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));if(!t.approve(funding,v[13]))revert TransferFailed();
        IPartialFunding(funding).partialTransfer(id,msg.sender,v[0],1,sequence,v[13],v[14]);if(!t.approve(funding,0))revert TransferFailed();
        if(t.balanceOf(address(this))+v[13]!=before_+v[14])revert TransferFailed();pool.cash=pool.cash-v[13]+v[14];pool.funding+=v[14];tokenAccounted[d.token]=tokenAccounted[d.token]-v[13]+v[14];
        _fractionCheckpoint(id,v[17]);if(v[15]==0)obligations[id].unprocessed--;
        _partialRisk(d,pool,pm,pc);emit ResearchReduction(id,msg.sender,sequence,v[1],v[2],v[3],v[4],v[5]);
    }

    // LOCAL payout/closure prerequisites only; no LP shares or capital withdrawals.
    struct UserPayments {uint256 freePaid;uint256 pnlPaid;uint256 fundingPaidToUser;}
    struct Obligations {uint256 unprocessed;uint256 activeReservations;uint256 pnlFractions;uint256 refundFractions;}
    mapping(uint256=>mapping(address=>UserPayments)) public userPayments;
    mapping(uint256=>Obligations) public obligations;
    mapping(uint256=>mapping(address=>bool)) public reservationClosed;
    event ResearchBalancesPaid(uint256 indexed id,address indexed account,uint256 free,uint256 pnl,uint256 fundingAmount);
    event ResearchReservationClosed(uint256 indexed id,address indexed account,uint256 positionId,uint256 sequence);
    function _fractionCheckpoint(uint256 id,uint256 flags) private {
        Obligations storage o=obligations[id];bool oldGain=flags&1!=0;bool oldRefund=flags&2!=0;bool gain=flags&4!=0;bool refund_=flags&8!=0;
        if(gain!=oldGain){if(gain)o.pnlFractions++;else o.pnlFractions--;}
        if(refund_!=oldRefund){if(refund_)o.refundFractions++;else o.refundFractions--;}
    }
    function claimableResearch(uint256 id,address who) public view returns(uint256 free,uint256 pnl,uint256 fundingAmount){
        (uint256 a,uint256 b,uint256 c)=studyLedger.rights(id,who);UserPayments storage u=userPayments[id][who];
        return(a-u.freePaid,b-u.pnlPaid,c-u.fundingPaidToUser);
    }
    function withdrawResearchBalances(uint256 id,uint256 free,uint256 pnl,uint256 fundingAmount) external lock {
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);if(d.state!=LocalFuturesCore.State.Normal)revert PolicyBlocked();
        (uint256 a,uint256 b,uint256 c)=claimableResearch(id,msg.sender);uint256 amount=free+pnl+fundingAmount;
        if(amount==0||free>a||pnl>b||fundingAmount>c)revert Insufficient();
        IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 destination=t.balanceOf(msg.sender);
        if(before_<tokenAccounted[d.token])revert Insufficient();UserPayments storage u=userPayments[id][msg.sender];PartialPool storage pool=partialPools[id];
        u.freePaid+=free;u.pnlPaid+=pnl;u.fundingPaidToUser+=fundingAmount;pool.free-=free;pool.pnl-=pnl;pool.funding-=fundingAmount;pool.cash-=amount;tokenAccounted[d.token]-=amount;
        if(!t.transfer(msg.sender,amount)||before_-t.balanceOf(address(this))!=amount||t.balanceOf(msg.sender)-destination!=amount)revert TransferFailed();
        emit ResearchBalancesPaid(id,msg.sender,free,pnl,fundingAmount);
    }
    // Funding calls this fixed peer to verify final position and immutable settlement sequence.
    function partialClosure(uint256 id,address who,uint256 positionId,uint256 epoch,uint256 sequence) external view returns(bool){
        if(msg.sender!=funding||epoch!=1)return false;
        (bool clear,uint256 pid,uint256 seq)=studyLedger.completion(id,who);return clear&&pid==positionId&&seq==sequence;
    }
    function closeResearchReservation(uint256 id) external lock {
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);(bool clear,uint256 pid,uint256 seq)=studyLedger.completion(id,msg.sender);
        if(d.state!=LocalFuturesCore.State.Normal||!clear||reservationClosed[id][msg.sender])revert PolicyBlocked();
        reservationClosed[id][msg.sender]=true;obligations[id].activeReservations--;
        IPartialFunding(funding).closePartialReservation(id,msg.sender,pid,1,seq);
        emit ResearchReservationClosed(id,msg.sender,pid,seq);
    }
    // Obligation foundation only: NOT permission to mint/redeem LP shares or reuse legacy capital.
    function lpObligationStatus(uint256 id) public view returns(bool clear,uint256[8] memory v){
        LocalFuturesCore.Domain memory d=_domain(id);PartialPool storage pool=partialPools[id];Obligations storage o=obligations[id];
        (bool ready,uint256[10] memory f)=IPartialFunding(funding).fundingObligations(id);bool clean=ready;for(uint256 i;i<10;i++)if(f[i]!=0)clean=false;
        v=[o.unprocessed,o.activeReservations,o.pnlFractions,o.refundFractions,pool.free+pool.pnl+pool.funding,pool.locked,pool.refund,clean?0:1];
        clear=d.state==LocalFuturesCore.State.Normal&&pool.oi==0&&pool.active==0&&pool.base==0&&pool.shorts==0&&IPartialToken(d.token).balanceOf(address(this))>=tokenAccounted[d.token];
        for(uint256 i;i<8;i++)if(v[i]!=0)clear=false;
        if(linkedPending[id]!=0||linkedHeld[id]!=0||linkedFinalReserved[id]!=0)clear=false;
    }

    // Shares represent only explicitly accounted LP capital. No transfer, donation sweep,
    // recovery capitalization or legacy-capital conversion entry point exists.
    mapping(uint256=>bool) public lpEnabled;
    mapping(uint256=>bool) public researchTouched;
    mapping(uint256=>uint256) public lpTotalShares;
    mapping(uint256=>mapping(address=>uint256)) public lpShares;
    event ResearchLPEnabled(uint256 indexed id);
    event ResearchLPDeposited(uint256 indexed id,address indexed owner,uint256 assets,uint256 shares);
    event ResearchLPRedeemed(uint256 indexed id,address indexed owner,uint256 shares,uint256 assets);
    function _lpReady(uint256 id) private view {
        (bool clear,)=lpObligationStatus(id);LocalFuturesCore.Domain memory d=_domain(id);
        // The original Core is a different custody path, never a source of LP assets.
        if(!clear||d.accounted!=0||d.oi!=0||d.active!=0||d.unprocessed!=0||d.recoveryId!=0)revert PolicyBlocked();
        PartialPool storage p=partialPools[id];
        if(p.cash!=p.lp+p.locked+p.free+p.pnl+p.funding+p.refund+p.fees+linkedHeld[id])revert Insufficient();
    }
    function enableResearchLP(uint256 id) external lock {
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);_gov(d);_lpReady(id);
        (uint256[18] memory f,,)=IPartialFunding(funding).fundingStudy(id);
        if(id<=legacyDomainCutoff||lpEnabled[id]||researchTouched[id]||partialPools[id].cash!=0||f[0]!=0)revert PolicyBlocked();
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

    // Opt-in Core-owned LOCAL positions; these records are custody bases, not positions.
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
    function configureLinkedResearch(uint256 id,uint256 capacity) external lock {
 _registryGuard(id);

        LocalFuturesCore.Domain memory d=_domain(id);_gov(d);PartialPool storage pool=partialPools[id];
        (uint256 sid,bytes32 policy,uint256 l,uint256 sh)=core.exposureBindings(id);
        (uint256[11] memory f,bytes32 fp)=IPartialFunding(funding).fundingSeries(id,sid);
        (uint256[18] memory legacy,,)=IPartialFunding(funding).fundingStudy(id);
        if(id<=legacyDomainCutoff||capacity==0||capacity>d.cfg.maxBatch||linkedCapacity[id]!=0||researchTouched[id]||d.state!=LocalFuturesCore.State.Normal||d.accounted!=0||d.oi!=0||legacy[0]!=0||sid==0||policy!=d.cfg.policyDigest||fp!=policy||l+sh!=0||block.timestamp>=f[0]||pool.cash!=pool.lp)revert PolicyBlocked();
        linkedCapacity[id]=capacity;emit LinkedConfigured(id,capacity);
    }
    function recordLinkedExposure(uint256 pid,uint256 margin,bytes32 receipt,uint256 oldL,uint256 oldS) external lock {
 (,uint256[5] memory registrationContext,)=core.coreExposureContext(pid);_registryGuard(registrationContext[0]);

        if(msg.sender!=address(core))revert Forbidden();
        (address who,uint256[5] memory v,bytes32 policy)=core.coreExposureContext(pid);
        uint256 id=v[0];uint256 sid=v[1];uint256 sequence=v[2];uint256 remaining=v[3]+v[4];
        if(linkedCapacity[id]==0){if(margin!=0)revert PolicyBlocked();return;}
        LocalFuturesCore.Domain memory d=_domain(id);PartialPool storage pool=partialPools[id];
        if(d.state!=LocalFuturesCore.State.Normal||d.accounted!=0||d.oi!=0||policy!=d.cfg.policyDigest||who==address(0))revert PolicyBlocked();
        bytes32 key=keccak256(abi.encode(address(core),funding,id,sid,who,pid,policy));
        if(IPartialFunding(funding).coreExposureSequences(key)!=sequence||receipt!=keccak256(abi.encode(key,sequence,block.timestamp,oldL,oldS,v[3],v[4])))revert Forbidden();
        (uint256[11] memory f,bytes32 fp)=IPartialFunding(funding).fundingSeries(id,sid);
        if(fp!=policy)revert Forbidden();
        (uint256 pm,uint256 pc,uint256 tm,uint256 tc)=core.observe(id);
        LinkedBasis storage b=linkedBases[pid];
        if(b.initialSize==0){
            if(pool.active>=d.cfg.maxPositions||sequence!=1||oldL+oldS!=0||remaining==0||margin==0||margin>1e36||block.timestamp>=f[0]+f[1]*f[2])revert Invalid();
            if(M.usd18(margin,pc,d.decimals_)<M.mulDiv(remaining,d.cfg.initialMarginBps,10000,true))revert Insufficient();
            b.key=key;b.initialSize=remaining;b.margin=margin;b.sequence=sequence;b.entry=pm;
            linkedFinal[pid].status=1;linkedFinalReserved[id]++;linkedPending[id]++;researchTouched[id]=true;
            IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));
            if(!t.transferFrom(who,address(this),margin)||t.balanceOf(address(this))-before_!=margin)revert TransferFailed();
            tokenAccounted[d.token]+=margin;pool.cash+=margin;pool.locked+=margin;pool.active++;
            pool.oi+=remaining;if(v[3]!=0)pool.base+=M.mulDiv(remaining,1e27,pm,true);else pool.shorts+=remaining;
        }else{
            if(b.key!=key||margin!=0||sequence!=b.sequence+1||oldL+oldS!=b.initialSize-b.closed||remaining>=oldL+oldS||linkedFinal[pid].status!=1)revert Invalid();
            uint256 closed=b.initialSize-remaining;uint256 total=M.mulDiv(b.margin,closed,b.initialSize,false);uint256 delta=total-b.held;
            if(remaining!=0){if(b.partials>=linkedCapacity[id])revert PolicyBlocked();b.partials++;}
            LinkedExit storage e=remaining==0?linkedFinal[pid]:linkedPartials[pid][sequence];
            if(remaining!=0&&e.status!=0)revert Invalid();
            e.status=remaining==0?2:3;e.timestamp=block.timestamp;e.heldDelta=delta;e.closed=closed;e.market=pm;e.collateral=pc;e.marketTime=tm;e.collateralTime=tc;e.cutoff=f[0]+f[1]*f[2];e.epoch=block.timestamp>=e.cutoff?f[2]+1:(block.timestamp-f[0])/f[1]+1;e.receipt=receipt;
            pool.locked-=delta;linkedHeld[id]+=delta;
            uint256 quantity=closed-b.closed;pool.oi-=quantity;
            if(oldL!=0)pool.base=pool.base-M.mulDiv(oldL,1e27,b.entry,true)+M.mulDiv(remaining,1e27,b.entry,true);else pool.shorts-=quantity;
            b.closed=closed;b.held=total;b.sequence=sequence;
            if(remaining==0){pool.active--;linkedFinalReserved[id]--;}
            else if(M.usd18(b.margin-total,pc,d.decimals_)<M.mulDiv(remaining,d.cfg.maintenanceBps,10000,true))revert Insufficient();
            emit LinkedHeld(id,pid,sequence,delta,remaining==0);
        }
        if(pool.oi!=f[8]+f[9]||pool.cash!=pool.lp+pool.locked+linkedHeld[id]+pool.free+pool.pnl+pool.funding+pool.refund+pool.fees||IPartialToken(d.token).balanceOf(address(this))<tokenAccounted[d.token])revert Insufficient();
        _partialRisk(d,pool,pm,pc);
        if(attribution!=address(0))ILocalAttribution(attribution).record(pid,oldL,oldS,receipt);
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

 // Local spent cap survives specification replacement; history is never rewritten.
 mapping(uint256=>uint256) public linkedConsumed;
 function applyCollection(uint256 pid,uint256 id,uint256 pnl,uint256 amount,uint256 fee,bytes32 accountKey,bytes32 epochKey,uint256 accountLimit) external lock {
 _registryGuard(id);

  address executor_=IPartialFunding(funding).collectionExecutor();
  if(msg.sender!=executor_||ICollectionExecution(executor_).partialAuthorization()!=keccak256(msg.data))revert Forbidden();
  LocalFuturesCore.Domain memory d=_domain(id);uint256 spent=linkedConsumed[pid]+pnl+amount+fee;
  if(d.state!=LocalFuturesCore.State.Normal||amount==0||linkedBases[pid].closed!=linkedBases[pid].initialSize||spent>linkedBases[pid].held)revert Invalid();
  IPartialToken t=IPartialToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 destination=t.balanceOf(funding);
  if(before_<tokenAccounted[d.token]||!t.approve(funding,amount))revert TransferFailed();
  IPartialFunding(funding).collectRepeat(id,accountKey,epochKey,amount,accountLimit);
  if(!t.approve(funding,0)||before_-t.balanceOf(address(this))!=amount||t.balanceOf(funding)-destination!=amount)revert TransferFailed();
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
  address registry=address(core.domainRegistry());if(registry!=address(0))ILocalDomainRegistry(registry).assertLegacyDomain(id);
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
 function registryGuardVersion() external pure returns(uint256){return 1;}
 function _registryGuard(uint256 id) private view {address r=address(core.domainRegistry());if(r!=address(0))ILocalFuturesPartialSettlementOperationRegistry(r).assertOperation(id,msg.sig);}
}
