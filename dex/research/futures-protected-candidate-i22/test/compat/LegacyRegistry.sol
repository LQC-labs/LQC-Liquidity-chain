// TEST ONLY I19: preserves historical liquidation-OFF admission for original accounting assertions. NEVER an operating Registry.
// TEST ONLY. All new operating tests use src/LQCFuturesMarketRegistry.sol.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesApprovedOracle} from "../../src/LQCFuturesApprovedOracle.sol";
import {LQCAggregatorOracleAdapter} from "../../src/baseline/LQCAggregatorOracleAdapter.sol";
import {LQCFuturesOracleController} from "../../src/LQCFuturesOracleController.sol";
import {LegacyRiskChecks as LQCFuturesRiskChecks} from "./LegacyRiskChecks.sol";
import {LQCFuturesOracleFactory} from "../../src/LQCFuturesOracleFactory.sol";
interface ILiquidationReadyEngine {
    function protectedLiquidationCandidate(uint256) external view returns(bool);
    function liquidationReductionBps(uint256) external view returns(uint256);
}
interface ILiquidationReadyVault {
    function supportedCollateral(address) external view returns(bool);
    function isFullyBacked(address) external view returns(bool);
}

/// @notice Registry for LQC Flow perpetual/futures markets.
/// @dev Stores market configuration only. Position, margin and settlement logic live in separate contracts.
contract LQCFuturesMarketRegistry {
    enum MarketMode { ACTIVE, REDUCE_ONLY, HALTED }
    struct Market {
        bytes32 symbol;
        address indexToken;
        address collateralToken;
        address oracle;
        uint32 maxLeverageBps;
        uint32 maintenanceMarginBps;
        bool active;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    uint256 public marketCount;

    mapping(uint256 => Market) private _markets;
    mapping(bytes32 => uint256) public marketIdBySymbol;
    mapping(uint256 => MarketMode) public marketMode;
    mapping(uint256 => bool) private _recoveryApproved; // Reserved legacy slot; validity now derives from the bound record.

    event MarketAdded(uint256 indexed marketId, bytes32 indexed symbol, address indexToken, address collateralToken, address oracle);
    event MarketStatusChanged(uint256 indexed marketId, bool active);
    event MarketModeChanged(uint256 indexed marketId, MarketMode previousMode, MarketMode newMode);
    event GuardianChanged(address indexed previousGuardian, address indexed newGuardian);
    event EmergencyTriggerApplied(uint256 indexed marketId, bool oracleHealthy, bool circuitBreakerAllowed, bool residualBadDebt, MarketMode resultingMode);
    event RecoveryApprovalChanged(uint256 indexed marketId, bool approved);
    event MarketRiskUpdated(uint256 indexed marketId, uint32 maxLeverageBps, uint32 maintenanceMarginBps);
    event MarketOracleUpdated(uint256 indexed marketId, address indexed oracle);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error InvalidSymbol();
    error MarketExists();
    error MarketNotFound();
    error InvalidRiskParameters();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert Forbidden();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        oracleFactory=new LQCFuturesOracleFactory();
        emit OwnershipTransferred(address(0), owner_);
    }


    uint256 public constant RECOVERY_TTL = 15 minutes;
    bytes32 public primaryTypeHash;
    bytes32 public referenceTypeHash;
    bytes32 public sourceReviewEvidence;
    bool public policySealed;
    uint256 public ownershipEpoch;
    mapping(uint256 => uint256) public policyNonce;
    struct OracleApproval { address token; bool approved; uint64 version; address controller; uint64 policyVersion; bytes32 codeHash; bytes32 evidence; }
    struct RecoveryApproval { address oracle; uint64 oracleVersion; uint256 nonce; uint256 ownershipEpoch; uint64 expiresAt; }
    mapping(address => OracleApproval) private _oracleApprovals;
    mapping(uint256 => RecoveryApproval) private _recoveryApprovals;
    LQCFuturesOracleFactory public immutable oracleFactory;
    /// Preserve the E-06-C getter ABI despite internal packing.
    function oracleApprovals(address oracle) external view returns(address token,bytes32 codeHash,bytes32 evidence,uint256 version,bool approved,address controller,uint256 policyVersion){
        OracleApproval memory a=_oracleApprovals[oracle];
        return(a.token,a.codeHash,a.evidence,uint256(a.version),a.approved,a.controller,uint256(a.policyVersion));
    }
    function recoveryApprovals(uint256 id) external view returns(address oracle,uint256 oracleVersion,uint256 nonce,uint256 ownershipEpoch,uint256 expiresAt){
        RecoveryApproval memory a=_recoveryApprovals[id];
        return(a.oracle,uint256(a.oracleVersion),a.nonce,a.ownershipEpoch,uint256(a.expiresAt));
    }
    event PolicySealed(bytes32 primaryHash, bytes32 referenceHash, bytes32 evidence);
    event OracleApproved(address indexed oracle,address indexed token,bytes32 evidence);
    event OracleRevoked(address indexed oracle);
    error OracleNotApproved();
    error OracleUnhealthy();
    error PolicyLocked();
    error UnsupportedSource();
    error InvalidRecovery();
    error RiskUnverified();
    error ResidualDebt();
    mapping(address=>address) public oracleControllers;
    address public riskEngine;
    address public riskVault;
    bool public riskSourceSealed;
    event OracleControllerCreated(address indexed aggregator,address indexed controller);
    event RiskSourceSealed(address indexed engine,address indexed vault);

    function createOracleController(address agg) external onlyOwner returns(address controller_) {
        if(oracleControllers[agg]!=address(0)||agg.codehash!=keccak256(type(LQCAggregatorOracleAdapter).runtimeCode))revert OracleNotApproved();
        controller_=oracleFactory.createController(agg);
        oracleControllers[agg]=controller_;
        emit OracleControllerCreated(agg,controller_);
    }
    function bindRiskSource(address engine_,address vault_) external onlyOwner {
        if(riskSourceSealed)revert PolicyLocked();
        (bool verified,)=LQCFuturesRiskChecks.verifiedDebt(address(this),owner,engine_,vault_,address(0));
        if(!verified)revert RiskUnverified();
        riskEngine=engine_;riskVault=vault_;riskSourceSealed=true;
        emit RiskSourceSealed(engine_,vault_);
    }
    function verifiedResidualDebt(uint256 id) public view returns(bool verified,uint256 debt) {
        if(!riskSourceSealed)return(false,0);
        return LQCFuturesRiskChecks.verifiedDebt(address(this),owner,riskEngine,riskVault,_markets[id].collateralToken);
    }
    function _requireNoDebt(uint256 id) private view {
        (bool verified,uint256 debt)=verifiedResidualDebt(id);
        if(!verified)revert RiskUnverified();
        if(debt!=0)revert ResidualDebt();
        if(!_liquidationConditions(id))revert RiskUnverified();
    }
    function _entryRiskHealthy(uint256 id) private view returns(bool) {
        (bool verified,uint256 debt)=verifiedResidualDebt(id);
        return verified&&debt==0&&_liquidationConditions(id);
    }

    /// Current structural/execution prerequisites, not a promise of future liquidation success.
    /// verifiedResidualDebt authenticates ALL fixed code/immutable bindings before any flag is trusted.
    function liquidationReady(uint256 id) external view returns(bool) {
        if(id==0||id>marketCount||marketMode[id]==MarketMode.HALTED)return false;
        (bool verified,)=verifiedResidualDebt(id);
        if(!verified||!_liquidationConditions(id))return false;
        Market memory m=_markets[id];
        return _healthy(m.indexToken,m.oracle);
    }
    function _liquidationConditions(uint256) private pure returns(bool){return true;}

    /// @dev Bootstrap trust boundary: owner attests independently reviewed immutable leaf code.
    ///      This cannot validate provider independence or honest prices. No later type replacement.
    function sealOraclePolicy(address primaryTemplate,address referenceTemplate,bytes32 evidence) external onlyOwner {
        if(policySealed) revert PolicyLocked();
        if(evidence==bytes32(0)||primaryTemplate==referenceTemplate) revert UnsupportedSource();
        _requireLeaf(primaryTemplate);_requireLeaf(referenceTemplate);
        primaryTypeHash=primaryTemplate.codehash;referenceTypeHash=referenceTemplate.codehash;
        sourceReviewEvidence=evidence;policySealed=true;
        emit PolicySealed(primaryTypeHash,referenceTypeHash,evidence);
    }
    /// @dev Unsupported proxy/dependency paths fail closed. PUSH data and Solidity CBOR metadata excluded.
    ///      Reviewed codehashes are still mandatory; this scanner is not a code audit.
    function _requireLeaf(address source) private view {
        bytes memory code=source.code;
        if(code.length<3) revert UnsupportedSource();
        uint256 end=code.length;
        uint256 metadata=(uint256(uint8(code[end-2]))<<8)|uint256(uint8(code[end-1]));
        if(metadata+2<end && uint8(code[end-metadata-2])>=0xa0 && uint8(code[end-metadata-2])<=0xbf) end-=metadata+2;
        for(uint256 i;i<end;i++) {
            uint8 op=uint8(code[i]);
            if(op>=0x60 && op<=0x7f) { i+=op-0x5f; continue; }
            if(op==0xf0||op==0xf1||op==0xf2||op==0xf4||op==0xf5||op==0xfa||op==0xff) revert UnsupportedSource();
        }
    }
    function createApprovedOracle(address token,address agg,bytes32 evidence) external onlyOwner returns(address oracle) {
        if(!policySealed||token==address(0)||evidence==bytes32(0)) revert OracleNotApproved();
        if(agg.codehash!=keccak256(type(LQCAggregatorOracleAdapter).runtimeCode)) revert OracleNotApproved();
        (address p,,address r,)=LQCAggregatorOracleAdapter(agg).feedConfigs(token);
        if(p.codehash!=primaryTypeHash||r.codehash!=referenceTypeHash) revert UnsupportedSource();
        // Same sealed codehash means the bootstrap leaf scan result is unchanged.
        address controller_=oracleControllers[agg];
        if(controller_==address(0)||LQCAggregatorOracleAdapter(agg).owner()!=controller_)revert OracleNotApproved();
        uint256 policyVersion=LQCFuturesOracleController(controller_).policyVersion();
        if(policyVersion==0||policyVersion>type(uint64).max)revert OracleNotApproved();
        oracle=oracleFactory.createGuard(token,agg,controller_);
        _oracleApprovals[oracle]=OracleApproval(token,true,1,controller_,uint64(policyVersion),oracle.codehash,evidence);
        _requireHealthy(token,oracle);
        emit OracleApproved(oracle,token,evidence);
    }
    function revokeOracle(address oracle) external onlyOwner {
        OracleApproval storage record=_oracleApprovals[oracle];
        if(!record.approved) revert OracleNotApproved();
        record.approved=false;record.version++;
        emit OracleRevoked(oracle);
    }
    function isOracleApproved(address oracle,address token) public view returns(bool) {
        OracleApproval memory record=_oracleApprovals[oracle];
        return record.approved&&record.token==token&&oracle.codehash==record.codeHash&&
            LQCFuturesOracleController(record.controller).policyVersion()==record.policyVersion;
    }
    function _requireApprovedOracle(address token,address oracle) private view {
        if(!isOracleApproved(oracle,token)) revert OracleNotApproved();
    }
    function _healthy(address token,address oracle) private view returns(bool) {
        return isOracleApproved(oracle,token)&&_quoteHealthy(token,oracle);
    }
    function _quoteHealthy(address token,address oracle) private view returns(bool) {
        try LQCFuturesApprovedOracle(oracle).getPrice(token) returns(uint256 p,uint256 t) {
            return p>0&&t>0&&t<=block.timestamp&&block.timestamp-t<=300;
        } catch { return false; }
    }
    function _requireHealthy(address token,address oracle) private view {
        _requireApprovedOracle(token,oracle);
        if(!_quoteHealthy(token,oracle)) revert OracleUnhealthy();
    }
    /// @notice Same tuple ABI as the old public Market mapping. active is now a live entry gate.
    function marketCollateral(uint256 id) external view returns(address){_requireMarket(id);return _markets[id].collateralToken;}
    function markets(uint256 id) external view returns(bytes32 symbol,address indexToken,address collateralToken,address oracle,uint32 maxLeverageBps,uint32 maintenanceMarginBps,bool active) {
        Market memory m=_markets[id];
        return(m.symbol,m.indexToken,m.collateralToken,m.oracle,m.maxLeverageBps,m.maintenanceMarginBps,
            m.active&&marketMode[id]==MarketMode.ACTIVE&&_healthy(m.indexToken,m.oracle)&&_entryRiskHealthy(id));
    }
    function addMarket(bytes32 symbol,address indexToken,address collateralToken,address oracle,uint32 maxLeverageBps,uint32 maintenanceMarginBps)
        external onlyOwner returns(uint256 marketId) {
        if(symbol==bytes32(0)) revert InvalidSymbol();
        if(indexToken==address(0)||collateralToken==address(0)||oracle==address(0)) revert ZeroAddress();
        if(marketIdBySymbol[symbol]!=0) revert MarketExists();
        if(maxLeverageBps<10000||maintenanceMarginBps==0||maintenanceMarginBps>=10000) revert InvalidRiskParameters();
        _requireHealthy(indexToken,oracle);
        marketId=++marketCount;
        _markets[marketId]=Market(symbol,indexToken,collateralToken,oracle,maxLeverageBps,maintenanceMarginBps,false);
        marketIdBySymbol[symbol]=marketId;marketMode[marketId]=MarketMode.HALTED;
        emit MarketAdded(marketId,symbol,indexToken,collateralToken,oracle);
        emit MarketStatusChanged(marketId,false);
    }
    function setGuardian(address newGuardian) external onlyOwner {
        if(newGuardian==address(0)) revert ZeroAddress();
        address previous=guardian;guardian=newGuardian;emit GuardianChanged(previous,newGuardian);
    }
    function _invalidate(uint256 id) private {
        delete _recoveryApprovals[id];policyNonce[id]++;
        emit RecoveryApprovalChanged(id,false);
    }
    function recoveryApproved(uint256 id) public view returns(bool) {
        RecoveryApproval memory a=_recoveryApprovals[id];
        Market memory m=_markets[id];
        return a.expiresAt>block.timestamp&&a.oracle==m.oracle&&
            a.oracleVersion==_oracleApprovals[m.oracle].version&&a.nonce==policyNonce[id]&&
            a.ownershipEpoch==ownershipEpoch&&isOracleApproved(m.oracle,m.indexToken);
    }
    function setRecoveryApproved(uint256 id,bool approved) external onlyOwner {
        _requireMarket(id);
        if(!approved) { _invalidate(id);return; }
        if(marketMode[id]!=MarketMode.REDUCE_ONLY) revert InvalidRecovery();
        _requireNoDebt(id);
        Market memory m=_markets[id];_requireHealthy(m.indexToken,m.oracle);
        if(block.timestamp>type(uint64).max-RECOVERY_TTL)revert InvalidRecovery();
        _recoveryApprovals[id]=RecoveryApproval(m.oracle,_oracleApprovals[m.oracle].version,policyNonce[id],ownershipEpoch,uint64(block.timestamp+RECOVERY_TTL));
        emit RecoveryApprovalChanged(id,true);
    }
    function _transition(uint256 id,MarketMode next) private {
        _requireMarket(id);MarketMode previous=marketMode[id];
        if(msg.sender!=owner && (next==MarketMode.ACTIVE||uint8(next)<uint8(previous))) revert Forbidden();
        if(next==MarketMode.ACTIVE) {
            if(previous!=MarketMode.REDUCE_ONLY||!recoveryApproved(id)) revert InvalidRecovery();
            _requireNoDebt(id);
            Market memory m=_markets[id];_requireHealthy(m.indexToken,m.oracle);
        }
        _invalidate(id);
        marketMode[id]=next;_markets[id].active=next==MarketMode.ACTIVE;
        emit MarketModeChanged(id,previous,next);emit MarketStatusChanged(id,_markets[id].active);
    }
    function setEmergencyMarketMode(uint256 id,MarketMode next) external onlyOwnerOrGuardian { _transition(id,next); }
    function setMarketMode(uint256 id,MarketMode next) external onlyOwner { _transition(id,next); }
    function setMarketActive(uint256 id,bool active) external onlyOwner { _transition(id,active?MarketMode.ACTIVE:MarketMode.HALTED); }
    function applyEmergencyTriggers(uint256 id,bool oracleHealthy,bool circuitBreakerAllowed,bool hasResidualBadDebt) external onlyOwnerOrGuardian {
        _requireMarket(id);Market memory m=_markets[id];
        MarketMode current=marketMode[id];MarketMode target=current;
        (bool riskVerified,uint256 actualDebt)=verifiedResidualDebt(id);
        bool oracleBad=!oracleHealthy||!circuitBreakerAllowed||!_healthy(m.indexToken,m.oracle);
        bool debtSignal=hasResidualBadDebt||actualDebt!=0;
        if(oracleBad||!riskVerified) target=MarketMode.HALTED;
        else if(debtSignal&&current==MarketMode.ACTIVE) target=MarketMode.REDUCE_ONLY;
        if(uint8(target)<uint8(current)) revert Forbidden();
        if(target!=current||oracleBad||!riskVerified||debtSignal) _transition(id,target);
        emit EmergencyTriggerApplied(id,oracleHealthy,circuitBreakerAllowed,hasResidualBadDebt,target);
    }
    function setRiskParameters(uint256 id,uint32 leverage,uint32 maintenance) external onlyOwner {
        _requireMarket(id);
        if(leverage<10000||maintenance==0||maintenance>=10000) revert InvalidRiskParameters();
        _invalidate(id);_markets[id].maxLeverageBps=leverage;_markets[id].maintenanceMarginBps=maintenance;
        emit MarketRiskUpdated(id,leverage,maintenance);
    }
    function setOracle(uint256 id,address oracle) external onlyOwner {
        _requireMarket(id);
        if(oracle==address(0)) revert ZeroAddress();
        if(marketMode[id]==MarketMode.ACTIVE) revert InvalidRecovery();
        _requireHealthy(_markets[id].indexToken,oracle);_invalidate(id);
        _markets[id].oracle=oracle;
        emit MarketOracleUpdated(id,oracle);
    }
    function transferOwnership(address newOwner) external onlyOwner {
        if(newOwner==address(0)) revert ZeroAddress();
        pendingOwner=newOwner;emit OwnershipTransferStarted(owner,newOwner);
    }
    function acceptOwnership() external {
        if(msg.sender!=pendingOwner) revert Forbidden();
        address previousOwner=owner;owner=msg.sender;pendingOwner=address(0);ownershipEpoch++;
        emit OwnershipTransferred(previousOwner,msg.sender);
    }
    function _requireMarket(uint256 id) private view { if(id==0||id>marketCount) revert MarketNotFound(); }
}

