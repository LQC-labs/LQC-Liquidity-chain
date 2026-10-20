// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ILocalDomainRegistry} from "./LocalFuturesCore.sol";
import {SettlementMath as M} from "./SettlementMath.sol";
interface ILedgerPreparationRegistry {function cutoff() external view returns(uint256);function assertSeriesPreparation(uint256,bytes32) external view;function assertPolicyGapPreparation(uint256,uint256) external view;}
interface ILedgerCore {
 function domainRegistry() external view returns(address);
 function fundingStudyDomain(uint256) external view returns(address,address,uint8);
 function observe(uint256) external view returns(uint256,uint256,uint256,uint256);
}
interface ILedgerCoreContext {
 function exposureBindings(uint256) external view returns(uint256,bytes32,uint256,uint256);
 function coreExposureContext(uint256) external view returns(address,uint256[5] memory,bytes32);
}
interface ILedgerFunding {
 function core() external view returns(address);
 function exposureLedger() external view returns(address);
}
/// @notice LOCAL 31337 exposure and USD rights only. No token authority or conversion.
contract LocalFuturesExposureLedger {
 ILedgerCore public immutable core;
 address public immutable funding;
 uint256 private entered;
 struct Domain {address token;address governor;uint8 decimals_;}
 error Forbidden();error Invalid();error WrongState();error PolicyBlocked();error Insufficient();error TransferFailed();error Reentrant();error Duplicate();
 constructor(address core_,address funding_){
  if(block.chainid!=31337||core_.code.length==0||funding_==address(0)||msg.sender!=funding_||funding_.code.length!=0)revert Forbidden();
  core=ILedgerCore(core_);funding=funding_;
 }
 modifier onlyFunding(){if(msg.sender!=funding||ILedgerFunding(funding).core()!=address(core)||ILedgerFunding(funding).exposureLedger()!=address(this))revert Forbidden();_;}
 modifier lock(){if(entered!=0)revert Reentrant();entered=1;_;entered=0;}
 function productionEnabled() external pure returns(bool){return false;}
 function _domain(uint256 id) private view returns(Domain memory d){(d.token,d.governor,d.decimals_)=core.fundingStudyDomain(id);}
 function _gov(Domain memory d,address actor) private pure {if(actor!=d.governor)revert Forbidden();}
enum SeriesState {Unset, Accruing, CutoffFixed, AwaitingConversion}
    struct RepeatSeries {
        uint256 origin;uint256 length;uint256 epochs;uint256 batch;uint256 capacity;
        uint256 rate;bytes32 policy;uint256 current;uint256 last;
        uint256 longOI;uint256 shortOI;uint256 active;
    }
    struct RepeatEpoch {
        uint256 start;uint256 cutoff;uint256 last;uint256 le;uint256 se;uint256 matched;
        uint256 participants;uint256 done;uint256 materializedLE;uint256 materializedSE;
        SeriesState state;M.Fraction usd;
    }
    struct RepeatCursor {uint256 epoch;uint256 last;uint256 l;uint256 s;}
    struct RepeatMember {uint256 le;uint256 se;bool enrolled;bool fixed_;M.Fraction debtUsd;M.Fraction claimUsd;}
    mapping(uint256=>mapping(uint256=>RepeatSeries)) private repeatSeries;
    mapping(uint256=>mapping(uint256=>mapping(uint256=>RepeatEpoch))) private repeatEpochs;
    mapping(uint256=>mapping(uint256=>mapping(address=>RepeatCursor))) private repeatCursors;
    mapping(uint256=>mapping(uint256=>mapping(uint256=>mapping(address=>RepeatMember)))) private repeatMembers;
    event SeriesCreated(uint256 indexed domain,uint256 indexed series,uint256 start,uint256 length,uint256 epochs,bytes32 policy);
    event SeriesOI(uint256 indexed domain,uint256 indexed series,address indexed account,uint256 epoch,uint256 longOI,uint256 shortOI);
    event SeriesCutoff(uint256 indexed domain,uint256 indexed series,uint256 indexed epoch,uint256 cutoff);
    event SeriesMemberFixed(uint256 indexed domain,uint256 indexed series,uint256 indexed epoch,address account);
    event SeriesAwaitingConversion(uint256 indexed domain,uint256 indexed series,uint256 indexed epoch);
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    // Appended state preserves every legacy/repeating storage root.
    enum InputMode {Unset,ResearchInput,CoreInput}
    mapping(uint256=>mapping(uint256=>InputMode)) public seriesInputMode;
    mapping(bytes32=>uint256) public coreExposureSequences;
    event CoreExposureRecorded(bytes32 indexed key,uint256 indexed sequence,bytes32 receipt);
    

    // OPT-IN LOCAL clock-only PolicyGap. No rate, USD amount, conversion or cash.
    // All new state is appended; normal epoch integrals/rights remain immutable.
    struct GapClock {uint256 last;uint256 l;uint256 s;uint256 le;uint256 se;}
    struct GapSeries {GapClock clock;bool enabled;bool unresolved;}
    struct GapPosition {GapClock clock;bool closed;bool touched;}
    mapping(uint256=>mapping(uint256=>GapSeries)) private gapSeries;
    mapping(uint256=>mapping(uint256=>mapping(address=>GapClock))) private gapAccounts;
    mapping(bytes32=>GapPosition) private gapPositions;
    event GapStudyEnabled(uint256 indexed domain,uint256 indexed series,uint256 cutoff);
    event GapExposure(bytes32 indexed key,uint256 timestamp,uint256 longExposure,uint256 shortExposure,bool closed);
    
    
    
    
    
function createFundingSeries(uint256 id,uint256 sid,uint256 start,uint256 length,uint256 epochs,uint256 batch,uint256 capacity,uint256 rate,bytes32 policy,address actor) external onlyFunding lock {
 _registryGuard(id);

 _gov(_domain(id),actor);_createSeries(id,sid,start,length,epochs,batch,capacity,rate,policy,InputMode.ResearchInput);
}

function createCoreFundingSeries(uint256 id,uint256 sid,uint256 start,uint256 length,uint256 epochs,uint256 batch,uint256 capacity,uint256 rate,bytes32 policy,address actor) external onlyFunding lock {
 _registryGuard(id);

 if(actor!=address(core))revert Forbidden();address registry=core.domainRegistry();if(registry!=address(0)&&id>ILedgerPreparationRegistry(registry).cutoff())ILedgerPreparationRegistry(registry).assertSeriesPreparation(id,keccak256(abi.encode(sid,start,length,epochs,batch,capacity,rate,policy)));_domain(id);_createSeries(id,sid,start,length,epochs,batch,capacity,rate,policy,InputMode.CoreInput);
}

function _createSeries(uint256 id,uint256 sid,uint256 start,uint256 length,uint256 epochs,uint256 batch,uint256 capacity,uint256 rate,bytes32 policy,InputMode mode) private {
        RepeatSeries storage s=repeatSeries[id][sid];
        // Explicit research envelope, never production defaults. No schedule update API.
        if(sid==0||s.origin!=0||start<=block.timestamp||start>block.timestamp+86400||length==0||length>86400||epochs==0||epochs>64||batch==0||batch>4||capacity==0||capacity>32||rate>1||policy==bytes32(0))revert PolicyBlocked();
        seriesInputMode[id][sid]=mode;s.origin=start;s.length=length;s.epochs=epochs;s.batch=batch;s.capacity=capacity;s.rate=rate;s.policy=policy;s.current=1;s.last=start;
        _repeatInit(id,sid,s);emit SeriesCreated(id,sid,start,length,epochs,policy);
    }

function _repeatInit(uint256 id,uint256 sid,RepeatSeries storage s) private {
        RepeatEpoch storage e=repeatEpochs[id][sid][s.current];
        if(e.state!=SeriesState.Unset)revert Duplicate();
        e.start=s.origin+(s.current-1)*s.length;e.cutoff=e.start+s.length;e.last=e.start;
        e.participants=s.active;e.state=SeriesState.Accruing;
    }

function _repeat(uint256 id,uint256 sid) private view returns(RepeatSeries storage s){
        s=repeatSeries[id][sid];if(s.origin==0||block.timestamp<s.origin)revert WrongState();
    }

function _repeatAdvance(uint256 id,uint256 sid,RepeatSeries storage s,uint256 limit) private {
        if(limit==0||limit>s.batch)revert Invalid();
        for(uint256 i;i<limit&&s.current<=s.epochs;i++){
            RepeatEpoch storage e=repeatEpochs[id][sid][s.current];uint256 t=block.timestamp<e.cutoff?block.timestamp:e.cutoff;
            uint256 dt=t-e.last;e.le+=s.longOI*dt;e.se+=s.shortOI*dt;
            e.matched+=(s.longOI<s.shortOI?s.longOI:s.shortOI)*dt;e.last=t;s.last=t;
            if(t<e.cutoff)break;
            uint256 sum=e.le+e.se;uint256 delta=e.le>=e.se?e.le-e.se:e.se-e.le;
            e.usd=sum==0?M.fraction(0,1):M.fraction(M.signed(e.matched*delta*s.rate,false),s.length*sum*10000);
            e.state=SeriesState.CutoffFixed;emit SeriesCutoff(id,sid,s.current,e.cutoff);
            s.current++;if(s.current<=s.epochs)_repeatInit(id,sid,s);
        }
    }

function advanceFundingSeries(uint256 id,uint256 sid,uint256 limit) external onlyFunding lock {
 _registryGuard(id);

        RepeatSeries storage s=_repeat(id,sid);_repeatAdvance(id,sid,s,limit);
    }

function _repeatAccount(uint256 id,uint256 sid,address who,RepeatSeries storage s,uint256 limit) private {
        if(limit==0||limit>s.batch)revert Invalid();RepeatCursor storage a=repeatCursors[id][sid][who];if(a.epoch==0)revert Invalid();
        uint256 target=s.last;
        for(uint256 i;i<limit&&a.epoch<=s.epochs&&a.last<=target;i++){
            RepeatEpoch storage e=repeatEpochs[id][sid][a.epoch];if(e.state==SeriesState.Unset)break;
            RepeatMember storage m=repeatMembers[id][sid][a.epoch][who];
            // Carried active accounts were already included at the epoch boundary.
            if(!m.enrolled&&(a.l!=0||a.s!=0))m.enrolled=true;
            uint256 t=target<e.cutoff?target:e.cutoff;uint256 dt=t-a.last;
            m.le+=a.l*dt;m.se+=a.s*dt;a.last=t;
            if(t<e.cutoff)break;a.epoch++;
        }
    }

function checkpointFundingAccount(uint256 id,uint256 sid,address who,uint256 limit) external onlyFunding lock {
 _registryGuard(id);

        RepeatSeries storage s=_repeat(id,sid);_repeatAccount(id,sid,who,s,limit);
    }

function setSeriesOI(uint256 id,uint256 sid,uint256 longOI,uint256 shortOI,address who) external onlyFunding lock {
 _registryGuard(id);

 if(seriesInputMode[id][sid]!=InputMode.ResearchInput||who==address(0))revert Forbidden();_setSeriesAccountOI(id,sid,who,longOI,shortOI);
}

function _setSeriesAccountOI(uint256 id,uint256 sid,address who,uint256 longOI,uint256 shortOI) private {
        RepeatSeries storage s=_repeat(id,sid);
        if(longOI>1e24||shortOI>1e24||(longOI!=0&&shortOI!=0))revert Invalid();
        _repeatAdvance(id,sid,s,s.batch);
        if(s.current>s.epochs||s.last!=block.timestamp)revert WrongState();
        RepeatCursor storage a=repeatCursors[id][sid][who];
        if(a.epoch==0){a.epoch=s.current;a.last=block.timestamp;}
        _repeatAccount(id,sid,who,s,s.batch);
        if(a.epoch!=s.current||a.last!=block.timestamp)revert WrongState();
        RepeatEpoch storage e=repeatEpochs[id][sid][s.current];RepeatMember storage m=repeatMembers[id][sid][s.current][who];
        bool oldActive=a.l!=0||a.s!=0;bool nextActive=longOI!=0||shortOI!=0;
        if(nextActive&&!m.enrolled){if(e.participants>=s.capacity)revert PolicyBlocked();m.enrolled=true;e.participants++;}
        if(oldActive!=nextActive){if(nextActive)s.active++;else s.active--;}
        s.longOI=s.longOI-a.l+longOI;s.shortOI=s.shortOI-a.s+shortOI;
        if(s.longOI>1e24||s.shortOI>1e24)revert Invalid();a.l=longOI;a.s=shortOI;
        emit SeriesOI(id,sid,who,s.current,longOI,shortOI);
    }

function fixSeriesMemberUSD(uint256 id,uint256 sid,uint256 epoch,address who) external onlyFunding lock {
 _registryGuard(id);

        RepeatSeries storage s=_repeat(id,sid);RepeatEpoch storage e=repeatEpochs[id][sid][epoch];RepeatMember storage m=repeatMembers[id][sid][epoch][who];
        if(e.state!=SeriesState.CutoffFixed||!m.enrolled||m.fixed_||repeatCursors[id][sid][who].epoch<=epoch)revert WrongState();
        bool longPays=e.le>=e.se;uint256 payer=longPays?e.le:e.se;uint256 receiver=longPays?e.se:e.le;
        m.debtUsd=payer==0?M.fraction(0,1):M.scaleFraction(e.usd,longPays?m.le:m.se,payer);
        m.claimUsd=receiver==0?M.fraction(0,1):M.scaleFraction(e.usd,longPays?m.se:m.le,receiver);
        m.fixed_=true;e.done++;e.materializedLE+=m.le;e.materializedSE+=m.se;
        if(e.done>e.participants)revert Invalid();emit SeriesMemberFixed(id,sid,epoch,who);
        // Keep immutable policy available through series; no Oracle read occurs here.
        if(s.policy==bytes32(0))revert PolicyBlocked();
    }

function finalizeSeriesUSD(uint256 id,uint256 sid,uint256 epoch) external onlyFunding lock {
 _registryGuard(id);

        _repeat(id,sid);RepeatEpoch storage e=repeatEpochs[id][sid][epoch];
        if(e.state!=SeriesState.CutoffFixed||e.done!=e.participants||e.materializedLE!=e.le||e.materializedSE!=e.se)revert WrongState();
        e.state=SeriesState.AwaitingConversion;emit SeriesAwaitingConversion(id,sid,epoch);
    }

function convertSeriesEpoch(uint256,uint256,uint256) external pure {revert PolicyBlocked();}

function fundingSeries(uint256 id,uint256 sid) external view returns(uint256[11] memory v,bytes32 policy){
        RepeatSeries storage s=repeatSeries[id][sid];return([s.origin,s.length,s.epochs,s.batch,s.capacity,s.rate,s.current,s.last,s.longOI,s.shortOI,s.active],s.policy);
    }

function fundingSeriesEpoch(uint256 id,uint256 sid,uint256 epoch) external view returns(uint256[11] memory v,int256 usdN,uint256 usdD){
        RepeatEpoch storage e=repeatEpochs[id][sid][epoch];return([e.start,e.cutoff,e.last,e.le,e.se,e.matched,e.participants,e.done,e.materializedLE,e.materializedSE,uint256(e.state)],e.usd.n,e.usd.d);
    }

function fundingSeriesAccount(uint256 id,uint256 sid,address who) external view returns(uint256[4] memory){RepeatCursor storage a=repeatCursors[id][sid][who];return[a.epoch,a.last,a.l,a.s];}

function fundingSeriesMember(uint256 id,uint256 sid,uint256 epoch,address who) external view returns(uint256[8] memory){
        RepeatMember storage m=repeatMembers[id][sid][epoch][who];return[m.le,m.se,m.enrolled?1:0,m.fixed_?1:0,uint256(m.debtUsd.n),m.debtUsd.d,uint256(m.claimUsd.n),m.claimUsd.d];
    }

function recordCoreExposure(uint256 id,uint256 sid,address account,uint256 positionId,uint256 sequence,bytes32 policy,uint256 expectedLong,uint256 expectedShort,uint256 nextLong,uint256 nextShort,address actor) external onlyFunding lock returns(bytes32 receipt){
 _registryGuard(id);

 if(actor!=address(core)||seriesInputMode[id][sid]!=InputMode.CoreInput||account==address(0)||positionId==0)revert Forbidden();
 RepeatSeries storage s=repeatSeries[id][sid];if(s.origin==0||policy!=s.policy)revert PolicyBlocked();
 bytes32 key=keccak256(abi.encode(address(core),funding,id,sid,account,positionId,policy));
 if(sequence!=coreExposureSequences[key]+1)revert Duplicate();
 RepeatCursor storage a=repeatCursors[id][sid][account];if(a.l!=expectedLong||a.s!=expectedShort)revert Invalid();
 (address owner,uint256[5] memory v,bytes32 p)=ILedgerCoreContext(address(core)).coreExposureContext(positionId);
 if(owner!=account||v[0]!=id||v[1]!=sid||v[2]!=sequence||v[3]!=nextLong||v[4]!=nextShort||p!=policy)revert Forbidden();
 coreExposureSequences[key]=sequence;
 if(gapSeries[id][sid].enabled&&block.timestamp>=s.origin+s.length*s.epochs){_recordGap(id,sid,account,key,s,expectedLong,expectedShort,nextLong,nextShort);}
 else{_setSeriesAccountOI(id,sid,account,nextLong,nextShort);if(gapSeries[id][sid].enabled)_registerGap(id,sid,account,key,s,nextLong,nextShort);}
 receipt=keccak256(abi.encode(key,sequence,block.timestamp,expectedLong,expectedShort,nextLong,nextShort));emit CoreExposureRecorded(key,sequence,receipt);
}

function enablePolicyGapStudy(uint256 id,uint256 sid,address actor) external onlyFunding lock {
 _registryGuard(id);

 _gov(_domain(id),actor);RepeatSeries storage s=repeatSeries[id][sid];GapSeries storage g=gapSeries[id][sid];
 (uint256 bound,bytes32 policy,,)=ILedgerCoreContext(address(core)).exposureBindings(id);
 if(seriesInputMode[id][sid]!=InputMode.CoreInput||s.origin==0||block.timestamp>=s.origin||g.enabled||bound!=sid||policy!=s.policy)revert PolicyBlocked();
 address registry=core.domainRegistry();if(registry!=address(0)&&id>ILedgerPreparationRegistry(registry).cutoff())ILedgerPreparationRegistry(registry).assertPolicyGapPreparation(id,sid);
 g.enabled=true;g.clock.last=s.origin+s.length*s.epochs;emit GapStudyEnabled(id,sid,g.clock.last);
}

function _registerGap(uint256 id,uint256 sid,address account,bytes32 key,RepeatSeries storage s,uint256 l,uint256 sh) private {
        uint256 end=s.origin+s.length*s.epochs;GapPosition storage p=gapPositions[key];GapClock storage a=gapAccounts[id][sid][account];
        p.clock.last=end;p.clock.l=l;p.clock.s=sh;p.closed=l==0&&sh==0;
        a.last=end;a.l=l;a.s=sh;GapClock storage g=gapSeries[id][sid].clock;g.l=s.longOI;g.s=s.shortOI;
    }

function _gapTick(GapClock storage c,uint256 t) private {
        if(t<c.last)revert Invalid();uint256 dt=t-c.last;c.le+=c.l*dt;c.se+=c.s*dt;c.last=t;
    }

function _recordGap(uint256 id,uint256 sid,address account,bytes32 key,RepeatSeries storage s,uint256 oldL,uint256 oldS,uint256 l,uint256 sh) private {
        GapPosition storage p=gapPositions[key];GapClock storage a=gapAccounts[id][sid][account];GapSeries storage g=gapSeries[id][sid];
        if(p.clock.last==0||p.closed||l>oldL||sh>oldS||l+sh>=oldL+oldS||p.clock.l!=oldL||p.clock.s!=oldS||a.l!=oldL||a.s!=oldS)revert PolicyBlocked();
        uint256 t=block.timestamp;if(t>type(uint64).max)revert Invalid();if(p.touched&&t<=p.clock.last)revert Duplicate();
        // Validate existing LOCAL observation without selecting a new conversion policy.
        core.observe(id);
        _repeatAdvance(id,sid,s,s.batch);_repeatAccount(id,sid,account,s,s.batch);
        uint256 end=s.origin+s.length*s.epochs;
        RepeatCursor storage cursor=repeatCursors[id][sid][account];
        if(s.current<=s.epochs||cursor.epoch<=s.epochs||cursor.last!=end)revert WrongState();
        if(g.clock.last<t&&(g.clock.l!=0||g.clock.s!=0))g.unresolved=true;
        _gapTick(g.clock,t);_gapTick(a,t);_gapTick(p.clock,t);
        s.longOI=s.longOI-oldL+l;s.shortOI=s.shortOI-oldS+sh;
        if(l==0&&sh==0)s.active--;
        cursor.l=l;cursor.s=sh;g.clock.l=s.longOI;g.clock.s=s.shortOI;
        a.l=l;a.s=sh;p.clock.l=l;p.clock.s=sh;p.closed=l==0&&sh==0;p.touched=true;
        emit GapExposure(key,t,p.clock.le,p.clock.se,p.closed);
    }

function policyGap(uint256 id,uint256 sid,address account,uint256 positionId) external view returns(uint256[12] memory v,bool closed,bool unresolved){
 RepeatSeries storage s=repeatSeries[id][sid];GapSeries storage g=gapSeries[id][sid];
 bytes32 key=keccak256(abi.encode(address(core),funding,id,sid,account,positionId,s.policy));
 GapPosition storage p=gapPositions[key];GapClock storage a=gapAccounts[id][sid][account];
 if(!g.enabled||p.clock.last==0)revert Invalid();uint256 t=g.clock.last;
 v=[s.origin+s.length*s.epochs,t,g.clock.le,g.clock.se,a.le+a.l*(t-a.last),a.se+a.s*(t-a.last),p.clock.le+p.clock.l*(t-p.clock.last),p.clock.se+p.clock.s*(t-p.clock.last),p.clock.last,p.clock.l,p.clock.s,coreExposureSequences[key]];
 return(v,p.closed,g.unresolved);
}

 function policyGapConfiguration(uint256 id,uint256 sid) external view returns(bool enabled,bool unresolved,uint256[5] memory clock){GapSeries storage g=gapSeries[id][sid];return(g.enabled,g.unresolved,[g.clock.last,g.clock.l,g.clock.s,g.clock.le,g.clock.se]);}
 function registryGuardVersion() external pure returns(uint256){return 1;}
 function _registryGuard(uint256 id) private view {address r=core.domainRegistry();if(r!=address(0)){ILocalDomainRegistry registry=ILocalDomainRegistry(r);if(id<=registry.cutoff())registry.assertLegacyDomain(id);else registry.assertOperation(id,msg.sig);}}
}
