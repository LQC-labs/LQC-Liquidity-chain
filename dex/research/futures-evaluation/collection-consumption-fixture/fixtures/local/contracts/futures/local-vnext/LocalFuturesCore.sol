// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCFuturesOracle} from "../ILQCFuturesOracle.sol";
import {SettlementMath as M} from "./SettlementMath.sol";


interface ICoreExposureFunding {
 function createCoreFundingSeries(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes32) external;
 function recordCoreExposure(uint256,uint256,address,uint256,uint256,bytes32,uint256,uint256,uint256,uint256) external returns(bytes32);
 function fundingSeries(uint256,uint256) external view returns(uint256[11] memory,bytes32);
}
interface IBoundLocalFunding {
 function core() external view returns(address);
 function collectFromCore(uint256,uint256,bytes32,address) external;

}

interface IBoundLocalPartial {
 function core() external view returns(address);
 function funding() external view returns(address);
 function recordLinkedExposure(uint256,uint256,bytes32,uint256,uint256) external;
}

interface ILocalToken {
    function decimals() external view returns(uint8);
    function balanceOf(address) external view returns(uint256);
    function transfer(address,uint256) external returns(bool);
    function transferFrom(address,address,uint256) external returns(bool);
}

/// @notice LOCAL ONLY accounting/recovery prototype. Constructor rejects every non-31337 chain.
/// @dev No production activation, upgrade, solver bypass, claim transfer, ADL, or debt forgiveness.
/// Existing deployed Futures contracts are neither imported as custody nor modified.
interface ILocalDomainRegistry {function core() external view returns(address);function cutoff() external view returns(uint256);function activate() external;function onDomainCreated(uint256) external;function assertLegacyDomain(uint256) external view;function assertOperation(uint256,bytes4) external view;}
contract LocalFuturesCore {
    enum State { Unset, Normal, RiskBlocked, PriceWait, BasisFixed, Settling, DebtFinalized, Paying, ClaimsOutstanding, Closed }
    struct Config {
        uint256 minOrder; uint256 maxOrder; uint256 maxPosition; uint256 maxOI;
        uint256 bufferUsd; uint256 liquidationCostUsd;
        uint32 maxPositions; uint32 maxBatch; uint32 marketAge; uint32 collateralAge; uint32 maxSkew;
        uint16 initialMarginBps; uint16 maintenanceBps; uint16 stressBps; uint16 feeBps; uint16 insuranceCoverageBps;
        uint256 fundingDeltaLimit; bytes32 policyDigest; bool observationPolicyReady; bool fundingPolicyReady;
    }
    struct Domain {
        address token; address marketOracle; address collateralOracle; address indexToken;
        address governor; address guardian; uint8 decimals_; State state;
        Config cfg;
        uint256 accounted; uint256 freeTotal; uint256 lockedTotal; uint256 lpCash;
        uint256 insurance; uint256 protocol; uint256 juniorTotal; uint256 oi; uint256 active;
        uint256 longBaseRay; uint256 shortNotional; uint256 fundingEntryAbsUsd27;
        uint256 recoveryId; uint256 cutoffTime; uint256 cutoffBlock; int256 fundingIndex; int256 fixedFunding;
        uint256 fixedMarket; uint256 fixedCollateral; uint256 marketUpdatedAt; uint256 collateralUpdatedAt;
        uint256 basisBlock; uint256 unprocessed; uint256 snapshotLastId;
        uint256 grossDeficit; uint256 insuranceUsed; uint256 uncoveredDeficit;
        uint256 epochQ; uint256 epochCapital; uint256 epochPaid;
        uint256 rewardBudget; uint256 rewardPerPosition; uint256 rewardAccrued;
    }
    struct Account { uint256 free; uint256 locked; uint256 profit; uint256 funding; uint256 claimPaid; uint256 normalPaid; }
    struct Position {
        address account; uint256 domainId; uint256 size; uint256 margin;
        uint256 entry; int256 fundingEntry; bool isLong; bool active; uint256 settledRecovery;
    }
    address public immutable governance;
    uint256 public domainCount; uint256 public positionCount;
    mapping(uint256=>Domain) private ds;
    mapping(uint256=>mapping(address=>Account)) public accounts;
    mapping(uint256=>Position) public positions;
    mapping(uint256=>mapping(address=>uint256)) public accountPosition;
    mapping(uint256=>mapping(address=>uint256)) public rewards;
    mapping(address=>uint256) public tokenAccounted;
    uint256 private entered;
    error Forbidden(); error Invalid(); error WrongState(); error PolicyBlocked(); error Duplicate();
    error Insufficient(); error TransferFailed(); error Reentrant(); error InvalidObservation();
    event DomainCreated(uint256 indexed id,bytes32 policyDigest);
    event Restricted(uint256 indexed id,uint256 recoveryId,uint256 cutoffBlock,int256 fundingIndex);
    event PricePending(uint256 indexed id);
    event BasisFixed(uint256 indexed id,uint256 market,uint256 collateral,uint256 marketTime,uint256 collateralTime);
    event PositionSettled(uint256 indexed id,uint256 indexed positionId,int256 pnlUsd27,int256 fundingUsd27,int256 raw,uint256 remainder,uint256 denominator);
    event DebtFinalized(uint256 indexed id,uint256 q);
    event CapitalAdded(uint256 indexed id,uint256 amount,uint256 cumulative);
    event ClaimPaid(uint256 indexed id,address indexed account,uint256 amount);
    event RewardAccrued(uint256 indexed id,uint256 indexed positionId,address indexed processor,uint256 amount);
    event RewardSkipped(uint256 indexed id,uint256 indexed positionId);
    modifier lock(){if(entered!=0)revert Reentrant();entered=1;_;entered=0;}
    constructor(){if(block.chainid!=31337)revert PolicyBlocked();governance=msg.sender;}
    function productionEnabled() external pure returns(bool){return false;}
    function domain(uint256 id) external view returns(Domain memory){return ds[id];}
    function _domain(uint256 id) private view returns(Domain storage d){d=ds[id];if(d.state==State.Unset)revert Invalid();}
    function _gov(Domain storage d) private view {if(msg.sender!=d.governor)revert Forbidden();}
    function createDomain(address token,address marketOracle,address collateralOracle,address indexToken,address governor,address guardian,Config calldata cfg) external returns(uint256 id){
        if(msg.sender!=governance)revert Forbidden();
        uint8 dec=ILocalToken(token).decimals();
        if((dec!=6&&dec!=18)||marketOracle==address(0)||collateralOracle==address(0)||indexToken==address(0)||governor==address(0)||guardian==address(0))revert Invalid();
        if(cfg.insuranceCoverageBps>10000)revert Invalid();
        if(cfg.minOrder==0||cfg.maxOrder<cfg.minOrder||cfg.maxPosition<cfg.maxOrder||cfg.maxPosition>1e24||cfg.maxOI<cfg.maxPosition||cfg.maxOI>1e30||cfg.maxPositions==0||cfg.maxPositions>10000||cfg.maxBatch==0||cfg.maxBatch>32||cfg.marketAge==0||cfg.collateralAge==0||cfg.maxSkew==0||cfg.maintenanceBps==0||cfg.initialMarginBps<cfg.maintenanceBps||cfg.initialMarginBps>10000||cfg.stressBps==0||cfg.feeBps>10000||cfg.fundingDeltaLimit==0||cfg.fundingDeltaLimit>1e30||cfg.policyDigest==bytes32(0))revert Invalid();
        id=++domainCount;Domain storage d=ds[id];d.token=token;d.marketOracle=marketOracle;d.collateralOracle=collateralOracle;d.indexToken=indexToken;d.governor=governor;d.guardian=guardian;d.decimals_=dec;d.cfg=cfg;d.state=State.Normal;
        if(address(domainRegistry)!=address(0))domainRegistry.onDomainCreated(id);
        emit DomainCreated(id,cfg.policyDigest);
    }
    function _pull(Domain storage d,uint256 amount) private {
        if(amount==0||amount>1e36||d.accounted>1e36-amount)revert Invalid();ILocalToken t=ILocalToken(d.token);uint256 before_=t.balanceOf(address(this));
        if(!t.transferFrom(msg.sender,address(this),amount)||t.balanceOf(address(this))-before_!=amount)revert TransferFailed();
        d.accounted+=amount;tokenAccounted[d.token]+=amount;
    }
    function _push(Domain storage d,address to,uint256 amount) private {
        if(amount==0)revert Invalid();ILocalToken t=ILocalToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 toBefore=t.balanceOf(to);
        d.accounted-=amount;tokenAccounted[d.token]-=amount;
        if(!t.transfer(to,amount)||before_-t.balanceOf(address(this))!=amount||t.balanceOf(to)-toBefore!=amount)revert TransferFailed();
    }
    function deposit(uint256 id,uint256 amount) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.Normal)revert WrongState();_pull(d,amount);accounts[id][msg.sender].free+=amount;d.freeTotal+=amount;
    }
    function withdrawDeposit(uint256 id,uint256 amount) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);Account storage a=accounts[id][msg.sender];
        if(amount==0||amount>a.free||ILocalToken(d.token).balanceOf(address(this))<tokenAccounted[d.token])revert Insufficient();
        // Unused deposits are not Futures counterparty assets; no Oracle price is required to return them.
        a.free-=amount;d.freeTotal-=amount;_push(d,msg.sender,amount);
    }
    function provideCapital(uint256 id,uint256 amount,uint8 bucket) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);_gov(d);if(d.state!=State.Normal||bucket>2)revert WrongState();_pull(d,amount);
        if(bucket==0)d.lpCash+=amount;else if(bucket==1)d.insurance+=amount;else d.protocol+=amount;
    }
    function observe(uint256 id) external view returns(uint256 pm,uint256 pc,uint256 tm,uint256 tc){
        Domain storage d=_domain(id);if(!d.cfg.observationPolicyReady)revert PolicyBlocked();
        (pm,tm)=ILQCFuturesOracle(d.marketOracle).getPrice(d.indexToken);
        (pc,tc)=ILQCFuturesOracle(d.collateralOracle).getPrice(d.token);
        if(pm==0||pc==0||pm>1e24||pc>1e24||tm==0||tc==0||tm>block.timestamp||tc>block.timestamp||block.timestamp-tm>d.cfg.marketAge||block.timestamp-tc>d.cfg.collateralAge||(tm>tc?tm-tc:tc-tm)>d.cfg.maxSkew)revert InvalidObservation();
    }
    function setFundingIndex(uint256 id,int256 next) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);_gov(d);if(d.state!=State.Normal)revert WrongState();if(!d.cfg.fundingPolicyReady)revert PolicyBlocked();
        this.observe(id);if(M.abs(next)>1e30||M.abs(next-d.fundingIndex)>d.cfg.fundingDeltaLimit)revert Invalid();d.fundingIndex=next;
    }
    function _risk(Domain storage d,uint256 pm,uint256 pc,uint256 oi,uint256 active) private view returns(bool){
        uint256 assets=M.usd18(d.lpCash,pc,d.decimals_);uint256 debt=M.mulDiv(d.juniorTotal,pc,10**d.decimals_,true);
        // Conservative gross positive-PnL bound, never offset by uncollectible losing accounts.
        // Long profits <= sum(baseQty * mark); short profits <= sum(short entry notional).
        uint256 openPnl=M.mulDiv(d.longBaseRay,pm,1e27,true)+d.shortNotional;
        uint256 openFunding27=M.mulDiv(oi,M.abs(d.fundingIndex),1e18,true)+d.fundingEntryAbsUsd27;
        uint256 need=debt+openPnl+M.mulDiv(openFunding27,1,1e9,true)+d.cfg.bufferUsd+M.mulDiv(oi,d.cfg.stressBps,10000,true)+active*d.cfg.liquidationCostUsd;
        return assets>=need;
    }
    function openPosition(uint256 id,uint256 margin,uint256 size,bool isLong) external lock returns(uint256 pid){
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.Normal)revert WrongState();if(!d.cfg.fundingPolicyReady)revert PolicyBlocked();
        (uint256 pm,uint256 pc,,)=this.observe(id);Account storage a=accounts[id][msg.sender];
        if(size<d.cfg.minOrder||size>d.cfg.maxOrder||size>d.cfg.maxPosition||d.oi+size>d.cfg.maxOI||d.active>=d.cfg.maxPositions||accountPosition[id][msg.sender]!=0||size>1e36)revert Invalid();
        uint256 feeUsd=M.mulDiv(size,d.cfg.feeBps,10000,true);
        (int256 fee,,)=M.tokens(-M.signed(feeUsd*1e9,false),pc,d.decimals_);uint256 f=M.abs(fee);
        if(margin==0||a.free<margin+f||M.usd18(margin,pc,d.decimals_)<M.mulDiv(size,d.cfg.initialMarginBps,10000,true))revert Insufficient();
        if(isLong)d.longBaseRay+=M.mulDiv(size,1e27,pm,true);else d.shortNotional+=size;
        d.fundingEntryAbsUsd27+=M.mulDiv(size,M.abs(d.fundingIndex),1e18,true);
        if(!_risk(d,pm,pc,d.oi+size,d.active+1))revert Insufficient();
        a.free-=margin+f;a.locked+=margin;d.freeTotal-=margin+f;d.lockedTotal+=margin;d.protocol+=f;
        pid=++positionCount;positions[pid]=Position(msg.sender,id,size,margin,pm,d.fundingIndex,isLong,true,0);accountPosition[id][msg.sender]=pid;d.oi+=size;d.active++;
    }
    function _funding(Position storage p,int256 index) private view returns(int256){
        bool negative=p.isLong==(index>=p.fundingEntry);
        return M.signed(M.mulDiv(p.size,M.abs(index-p.fundingEntry),1e18,negative),negative);
    }
    function _net(Position storage p,uint256 pm,int256 index) private view returns(int256){
        return M.pnl27(p.size,p.entry,pm,p.isLong)+_funding(p,index);
    }
    function _settle(uint256 pid,uint256 pm,uint256 pc,int256 index,uint256 rid) private {
        Position storage p=positions[pid];Domain storage d=ds[p.domainId];Account storage a=accounts[p.domainId][p.account];
        if(!p.active)revert Duplicate();int256 pnl=M.pnl27(p.size,p.entry,pm,p.isLong);int256 funding=_funding(p,index);int256 net=pnl+funding;
        (int256 raw,uint256 rem,uint256 den)=M.tokens(net,pc,d.decimals_);
        uint256 returned=p.margin;
        if(raw<0){uint256 loss=M.abs(raw);uint256 collected=loss<p.margin?loss:p.margin;returned-=collected;d.lpCash+=collected;
            uint256 deficit=loss-collected;if(deficit!=0){uint256 cap=M.mulDiv(deficit,d.cfg.insuranceCoverageBps,10000,false);uint256 covered=cap<d.insurance?cap:d.insurance;d.insurance-=covered;d.lpCash+=covered;d.grossDeficit+=deficit;d.insuranceUsed+=covered;d.uncoveredDeficit+=deficit-covered;}
        }else if(raw>0){
            uint256 q=uint256(raw);uint256 fq;
            if(funding>0)fq=pnl<=0?q:M.mulDiv(q,uint256(funding),uint256(pnl+funding),false);
            a.profit+=q-fq;a.funding+=fq;d.juniorTotal+=q;
        }
        // Netting is position-local; the event and claim categories retain PnL/funding provenance.
        a.locked-=p.margin;d.lockedTotal-=p.margin;a.free+=returned;d.freeTotal+=returned;
        if(p.isLong)d.longBaseRay-=M.mulDiv(p.size,1e27,p.entry,true);else d.shortNotional-=p.size;
        d.fundingEntryAbsUsd27-=M.mulDiv(p.size,M.abs(p.fundingEntry),1e18,true);
        d.oi-=p.size;d.active--;p.active=false;p.settledRecovery=rid;accountPosition[p.domainId][p.account]=0;
        emit PositionSettled(p.domainId,pid,pnl,funding,raw,rem,den);
    }
    function closePosition(uint256 pid) external lock {
 _registryGuard(positions[pid].domainId);

        Position storage p=positions[pid];if(msg.sender!=p.account)revert Forbidden();Domain storage d=_domain(p.domainId);if(d.state!=State.Normal)revert WrongState();
        (uint256 pm,uint256 pc,,)=this.observe(p.domainId);_settle(pid,pm,pc,d.fundingIndex,0);
        if(d.lpCash<d.juniorTotal||d.uncoveredDeficit!=0||!_risk(d,pm,pc,d.oi,d.active))_restrict(p.domainId);
    }
    function liquidate(uint256 pid) external lock {
 _registryGuard(positions[pid].domainId);

        Position storage p=positions[pid];Domain storage d=_domain(p.domainId);if(d.state!=State.Normal)revert WrongState();
        (uint256 pm,uint256 pc,,)=this.observe(p.domainId);int256 equity=M.signed(M.usd18(p.margin,pc,d.decimals_)*1e9,false)+_net(p,pm,d.fundingIndex);
        if(equity>=M.signed(M.mulDiv(p.size,d.cfg.maintenanceBps,10000,true)*1e9,false))revert Invalid();
        _settle(pid,pm,pc,d.fundingIndex,0);if(d.uncoveredDeficit!=0||d.lpCash<d.juniorTotal||!_risk(d,pm,pc,d.oi,d.active))_restrict(p.domainId);
    }
    function checkRisk(uint256 id) external lock returns(bool ok){
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.Normal)revert WrongState();
        try this.observe(id) returns(uint256 pm,uint256 pc,uint256,uint256){ok=_risk(d,pm,pc,d.oi,d.active);}catch{ok=false;}
        if(!ok)_restrict(id); // Intentionally DOES NOT revert: the restriction must persist.
    }
    function _restrict(uint256 id) private {
        Domain storage d=ds[id];d.state=State.RiskBlocked;d.recoveryId++;d.cutoffTime=block.timestamp;d.cutoffBlock=block.number;d.fixedFunding=d.fundingIndex;d.snapshotLastId=positionCount;d.unprocessed=d.active;
        emit Restricted(id,d.recoveryId,block.number,d.fixedFunding);_tryFix(id);
    }
    function beginRecovery(uint256 id) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(msg.sender!=d.governor&&msg.sender!=d.guardian)revert Forbidden();if(d.state!=State.Normal)revert WrongState();_restrict(id);
    }
    function _tryFix(uint256 id) private {
        Domain storage d=ds[id];if(!d.cfg.fundingPolicyReady){d.state=State.PriceWait;emit PricePending(id);return;}
        try this.observe(id) returns(uint256 pm,uint256 pc,uint256 tm,uint256 tc){
            d.fixedMarket=pm;d.fixedCollateral=pc;d.marketUpdatedAt=tm;d.collateralUpdatedAt=tc;d.basisBlock=block.number;d.state=State.BasisFixed;emit BasisFixed(id,pm,pc,tm,tc);
        }catch{d.state=State.PriceWait;emit PricePending(id);}
    }
    function fixBasis(uint256 id) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.PriceWait)revert WrongState();_tryFix(id);
    }
    function settleBatch(uint256 id,uint256[] calldata pids) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.BasisFixed&&d.state!=State.Settling)revert WrongState();
        if(pids.length==0||pids.length>d.cfg.maxBatch)revert Invalid();d.state=State.Settling;
        for(uint256 i;i<pids.length;i++){
            uint256 pid=pids[i];Position storage p=positions[pid];
            if(pid>d.snapshotLastId||p.domainId!=id)revert Invalid();
            _settle(pid,d.fixedMarket,d.fixedCollateral,d.fixedFunding,d.recoveryId);d.unprocessed--;
            uint256 r=d.rewardPerPosition;
            if(r!=0&&d.rewardBudget>=r){d.rewardBudget-=r;d.rewardAccrued+=r;rewards[id][msg.sender]+=r;emit RewardAccrued(id,pid,msg.sender,r);}else emit RewardSkipped(id,pid);
        }
    }
    function finalizeDebt(uint256 id) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.BasisFixed&&d.state!=State.Settling)revert WrongState();if(d.unprocessed!=0||d.active!=0||d.oi!=0||d.lockedTotal!=0)revert Invalid();
        d.epochQ=d.juniorTotal;d.epochCapital=d.lpCash<d.epochQ?d.lpCash:d.epochQ;d.state=State.DebtFinalized;emit DebtFinalized(id,d.epochQ);
    }
    function addRecoveryCapital(uint256 id,uint256 amount) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.DebtFinalized&&d.state!=State.Paying&&d.state!=State.ClaimsOutstanding)revert WrongState();
        if(amount>d.epochQ-d.epochCapital)revert Invalid();_pull(d,amount);d.lpCash+=amount;d.epochCapital+=amount;emit CapitalAdded(id,amount,d.epochCapital);
    }
    function claimable(uint256 id,address who) public view returns(uint256){
        Domain storage d=ds[id];if(d.state!=State.DebtFinalized&&d.state!=State.Paying&&d.state!=State.ClaimsOutstanding)return 0;
        Account storage a=accounts[id][who];if(d.epochQ==0)return 0;
        return M.mulDiv(a.profit+a.funding-a.normalPaid,d.epochCapital,d.epochQ,false)-a.claimPaid;
    }
    function withdrawProfit(uint256 id,uint256 amount) external lock returns(bool paid){
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.Normal)revert WrongState();Account storage a=accounts[id][msg.sender];
        if(amount==0||amount>a.profit+a.funding-a.normalPaid)revert Insufficient();
        try this.observe(id) returns(uint256 pm,uint256 pc,uint256,uint256){
            if(!_risk(d,pm,pc,d.oi,d.active)){_restrict(id);return false;}
        }catch{_restrict(id);return false;}
        a.normalPaid+=amount;d.juniorTotal-=amount;d.lpCash-=amount;_push(d,msg.sender,amount);return true;
    }
    function claim(uint256 id,uint256 amount) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(amount==0||amount>claimable(id,msg.sender))revert Insufficient();
        accounts[id][msg.sender].claimPaid+=amount;d.juniorTotal-=amount;d.lpCash-=amount;d.epochPaid+=amount;d.state=State.ClaimsOutstanding;emit ClaimPaid(id,msg.sender,amount);_push(d,msg.sender,amount);
    }
    function fundProcessing(uint256 id,uint256 rewardPerPosition) external payable lock {
 _registryGuard(id);

        Domain storage d=_domain(id);_gov(d);if(msg.value==0||rewardPerPosition==0)revert Invalid();
        if(d.state!=State.Normal&&rewardPerPosition!=d.rewardPerPosition)revert Invalid();d.rewardPerPosition=rewardPerPosition;d.rewardBudget+=msg.value;
    }
    function claimReward(uint256 id) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);uint256 r=rewards[id][msg.sender];if(r==0)revert Insufficient();rewards[id][msg.sender]=0;d.rewardAccrued-=r;
        (bool ok,)=msg.sender.call{value:r}("");if(!ok)revert TransferFailed();
    }
    function closeRecovery(uint256 id) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);if(d.state!=State.DebtFinalized&&d.state!=State.ClaimsOutstanding)revert WrongState();if(d.juniorTotal!=0||d.unprocessed!=0)revert Insufficient();d.state=State.Closed;
    }
    function withdrawCapital(uint256,uint256) external pure {revert PolicyBlocked();} // LP share economics not approved.
    function transferClaim(uint256,address,uint256) external pure {revert PolicyBlocked();}
    function reuseClaim(uint256,uint256) external pure {revert PolicyBlocked();}
    function reducePosition(uint256,uint256) external pure {revert PolicyBlocked();} // Partial normal-close carry policy remains unapproved.
    function invariant(uint256 id) external view returns(bool book,bool custody,int256 lpEquity){
        Domain storage d=ds[id];book=d.accounted==d.freeTotal+d.lockedTotal+d.lpCash+d.insurance+d.protocol;
        custody=ILocalToken(d.token).balanceOf(address(this))>=tokenAccounted[d.token];lpEquity=M.signed(d.lpCash,false)-M.signed(d.juniorTotal,false);
    }


    // Fixed research-only external module binding. No position function calls this module.
    address public localFunding;
    mapping(bytes32=>bool) public fundingResearchSettled;
    function bindFundingStudy(address module) external lock {
        _checkBinding(module,localFunding,false);localFunding=module;
    }
    function fundingStudyDomain(uint256 id) external view returns(address token,address governor,uint8 decimals_){
        Domain storage d=_domain(id);return(d.token,d.governor,d.decimals_);
    }
    function collectResearchFunding(uint256 id,uint256 epoch,bytes32 settlementId,address account) external lock {
 _registryGuard(id);

        _domain(id);if(msg.sender!=account||epoch!=1||settlementId==bytes32(0)||localFunding==address(0))revert Forbidden();
        bytes32 key=keccak256(abi.encode(address(this),id,epoch,settlementId,account));
        if(fundingResearchSettled[key])revert Duplicate();fundingResearchSettled[key]=true;
        IBoundLocalFunding(localFunding).collectFromCore(id,epoch,settlementId,account);
    }

    // Fixed local research module. Existing trading and Vault functions do not call it.
    address public localPartial;
    function bindPartialStudy(address module) external lock {
        _checkBinding(module,localPartial,true);
        if(IBoundLocalPartial(module).funding()!=localFunding)revert Invalid();localPartial=module;
    }

    // INACTIVE LOCAL exposure-only research. No existing Position, margin, token,
    // LP, PnL, Funding cash or original trading function uses these records.
    struct ExposureBinding {uint256 series;bytes32 policy;uint256 longOI;uint256 shortOI;}
    struct ExposurePosition {address account;uint256 domain;uint256 series;uint256 size;uint256 sequence;bool long_;}
    mapping(uint256=>ExposureBinding) public exposureBindings;
    mapping(uint256=>ExposurePosition) public exposurePositions;
    mapping(uint256=>mapping(address=>uint256)) public exposureAccountPosition;
    uint256 public exposurePositionCount;
    event ExposureResearchRecorded(uint256 indexed domain,uint256 indexed positionId,address indexed account,uint256 sequence,uint256 size,bytes32 receipt);
    function configureExposureResearch(uint256 id,uint256 sid,uint256 start,uint256 length,uint256 epochs,uint256 batch,uint256 capacity,uint256 rate) external lock {
 _registryGuard(id);

        Domain storage d=_domain(id);_gov(d);
        if(d.state!=State.Normal||!d.cfg.fundingPolicyReady||localFunding==address(0)||exposureBindings[id].series!=0||sid==0)revert PolicyBlocked();
        exposureBindings[id]=ExposureBinding(sid,d.cfg.policyDigest,0,0);
        ICoreExposureFunding(localFunding).createCoreFundingSeries(id,sid,start,length,epochs,batch,capacity,rate,d.cfg.policyDigest);
        _checkExposure(id);
    }
    function openExposureResearch(uint256 id,uint256 size,bool long_) external lock returns(uint256){
 _registryGuard(id);
return _openExposure(id,size,long_,0);}
    function openLinkedExposureResearch(uint256 id,uint256 size,bool long_,uint256 margin) external lock returns(uint256){
 _registryGuard(id);

        if(localPartial==address(0)||margin==0)revert PolicyBlocked();return _openExposure(id,size,long_,margin);
    }
    function _openExposure(uint256 id,uint256 size,bool long_,uint256 margin) private returns(uint256 pid){
        Domain storage d=_domain(id);ExposureBinding storage b=exposureBindings[id];
        if(d.state!=State.Normal||b.series==0||b.policy!=d.cfg.policyDigest||!d.cfg.fundingPolicyReady)revert PolicyBlocked();
        if(size<d.cfg.minOrder||size>d.cfg.maxOrder||size>d.cfg.maxPosition||b.longOI+b.shortOI+size>d.cfg.maxOI||exposureAccountPosition[id][msg.sender]!=0)revert Invalid();
        pid=++exposurePositionCount;exposurePositions[pid]=ExposurePosition(msg.sender,id,b.series,size,1,long_);exposureAccountPosition[id][msg.sender]=pid;
        _recordExposure(pid,0,0,margin);
    }
    function reduceExposureResearch(uint256 pid,uint256 quantity,uint256 sequence) external lock {
 _registryGuard(exposurePositions[pid].domain);

        ExposurePosition storage p=exposurePositions[pid];Domain storage d=_domain(p.domain);
        if(msg.sender!=p.account)revert Forbidden();if(d.state!=State.Normal||p.size==0||quantity==0||quantity>p.size||sequence!=p.sequence+1)revert Invalid();
        uint256 oldLong=p.long_?p.size:0;uint256 oldShort=p.long_?0:p.size;p.size-=quantity;p.sequence=sequence;
        if(p.size==0)exposureAccountPosition[p.domain][p.account]=0;_recordExposure(pid,oldLong,oldShort,0);
    }
    function _recordExposure(uint256 pid,uint256 oldLong,uint256 oldShort,uint256 margin) private {
        ExposurePosition storage p=exposurePositions[pid];ExposureBinding storage b=exposureBindings[p.domain];
        if(p.series!=b.series||b.policy!=ds[p.domain].cfg.policyDigest)revert Invalid();
        uint256 nextLong=p.long_?p.size:0;uint256 nextShort=p.long_?0:p.size;
        b.longOI=b.longOI-oldLong+nextLong;b.shortOI=b.shortOI-oldShort+nextShort;
        bytes32 receipt=ICoreExposureFunding(localFunding).recordCoreExposure(p.domain,p.series,p.account,pid,p.sequence,b.policy,oldLong,oldShort,nextLong,nextShort);
        _checkExposure(p.domain);
        if(localPartial!=address(0))IBoundLocalPartial(localPartial).recordLinkedExposure(pid,margin,receipt,oldLong,oldShort);
        emit ExposureResearchRecorded(p.domain,pid,p.account,p.sequence,p.size,receipt);
    }
    function _checkExposure(uint256 id) private view {
        ExposureBinding storage b=exposureBindings[id];(uint256[11] memory v,bytes32 policy)=ICoreExposureFunding(localFunding).fundingSeries(id,b.series);
        if(policy!=b.policy||v[8]!=b.longOI||v[9]!=b.shortOI)revert Invalid();
    }
    function coreExposureContext(uint256 pid) external view returns(address account,uint256[5] memory v,bytes32 policy){
        ExposurePosition storage p=exposurePositions[pid];return(p.account,[p.domain,p.series,p.sequence,p.long_?p.size:0,p.long_?0:p.size],exposureBindings[p.domain].policy);
    }

    // Appended storage: all historical Core storage roots retain their positions.
    ILocalDomainRegistry public domainRegistry;
    // Version 1: every post-activation mutation is blocked, including Registered domains.
    function registryGuardVersion() external pure returns(uint256){return 1;}
    function bindDomainRegistry(address module) external lock {
        _checkBinding(module,address(domainRegistry),false);
        ILocalDomainRegistry r=ILocalDomainRegistry(module);domainRegistry=r;r.activate();
    }
    function _registryGuard(uint256 id) private view {if(address(domainRegistry)!=address(0))domainRegistry.assertOperation(id,msg.sig);}

    // Preserve order: governor, existing binding, Partial funding prerequisite,
    // target code, target Core. No external call occurs before these prerequisites.
    function _checkBinding(address module,address current,bool needsFunding) private view {
        if(msg.sender!=governance||current!=address(0)||(needsFunding&&localFunding==address(0))||module.code.length==0)revert Forbidden();
        if(IBoundLocalFunding(module).core()!=address(this))revert Invalid();
    }
}
