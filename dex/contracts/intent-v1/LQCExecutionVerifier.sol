// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Public, quorum-attested verifier for canonical same-chain Intent execution evidence.
contract LQCExecutionVerifier {
    bytes32 public constant REPORT_TYPEHASH = keccak256(
        "ExecutionReport(bytes32 intentHash,address solver,bytes32 quoteHash,bytes32 signedRouteHash,bytes32 observedRouteHash,bytes32 expectedExecutionHash,bytes32 observedExecutionHash,bytes32 transactionHash,bytes32 blockHash,bytes32 canonicalReceiptHash,uint256 minimumAmountOut,uint256 actualAmountOut,uint256 estimatedGas,uint256 gasUsed,uint256 priceImpactBps,uint256 marketDeviationBps,uint256 observedBlock,uint256 deadline)"
    );
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("LQC Execution Verifier");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint256 public constant BPS = 10_000;

    enum FaultReason { NONE, NON_DELIVERY, BELOW_MINIMUM, INVALID_ROUTE, FRAUDULENT_RECEIPT, QUALITY_BREACH }

    struct ExecutionReport {
        bytes32 intentHash;
        address solver;
        bytes32 quoteHash;
        bytes32 signedRouteHash;
        bytes32 observedRouteHash;
        bytes32 expectedExecutionHash;
        bytes32 observedExecutionHash;
        bytes32 transactionHash;
        bytes32 blockHash;
        bytes32 canonicalReceiptHash;
        uint256 minimumAmountOut;
        uint256 actualAmountOut;
        uint256 estimatedGas;
        uint256 gasUsed;
        uint256 priceImpactBps;
        uint256 marketDeviationBps;
        uint256 observedBlock;
        uint256 deadline;
    }

    struct Verdict { bytes32 intentHash; address solver; FaultReason reason; uint256 verifiedAt; }

    address public owner;
    address public pendingOwner;
    address public guardian;
    bool public paused;
    uint256 public quorum;
    uint256 public maxGasOverrunBps;
    uint256 public maxPriceImpactBps;
    uint256 public maxMarketDeviationBps;
    mapping(address attester => bool enabled) public attesterEnabled;
    mapping(bytes32 reportHash => Verdict) public verdicts;

    event VerdictRecorded(bytes32 indexed reportHash, bytes32 indexed intentHash, address indexed solver, FaultReason reason, uint256 signerCount);
    event AttesterUpdated(address indexed attester, bool enabled);
    event PolicyUpdated(uint256 quorum, uint256 maxGasOverrunBps, uint256 maxPriceImpactBps, uint256 maxMarketDeviationBps);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PauseUpdated(bool paused);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized(); error ZeroAddress(); error InvalidReport(); error InvalidSignature(); error InvalidPolicy(); error AlreadyVerified(); error Paused();
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}

    constructor(address owner_,address guardian_,uint256 quorum_,uint256 gasOverrunBps_,uint256 priceImpactBps_,uint256 deviationBps_){
        if(owner_==address(0)||guardian_==address(0))revert ZeroAddress();
        owner=owner_;guardian=guardian_;_setPolicy(quorum_,gasOverrunBps_,priceImpactBps_,deviationBps_);emit OwnershipTransferred(address(0),owner_);
    }

    function domainSeparator() public view returns(bytes32){return keccak256(abi.encode(DOMAIN_TYPEHASH,NAME_HASH,VERSION_HASH,block.chainid,address(this)));}
    function hashReport(ExecutionReport calldata report) public view returns(bytes32){return keccak256(abi.encodePacked("\x19\x01",domainSeparator(),keccak256(abi.encode(REPORT_TYPEHASH,report))));}

    function submitReport(ExecutionReport calldata report,bytes[] calldata signatures) external returns(bytes32 reportHash,FaultReason reason){
        if(paused)revert Paused();
        if(report.intentHash==bytes32(0)||report.solver==address(0)||report.quoteHash==bytes32(0)||report.signedRouteHash==bytes32(0)||report.transactionHash==bytes32(0)||report.blockHash==bytes32(0)||report.canonicalReceiptHash==bytes32(0)||report.minimumAmountOut==0||report.estimatedGas==0||report.observedBlock==0||report.observedBlock>block.number||block.timestamp>report.deadline)revert InvalidReport();
        if(signatures.length<quorum||signatures.length>16)revert InvalidSignature();
        reportHash=hashReport(report);if(verdicts[reportHash].verifiedAt!=0)revert AlreadyVerified();
        address previous;
        for(uint256 i;i<signatures.length;++i){address signer=_recover(reportHash,signatures[i]);if(!attesterEnabled[signer]||signer<=previous)revert InvalidSignature();previous=signer;}
        reason=_classify(report);
        verdicts[reportHash]=Verdict(report.intentHash,report.solver,reason,block.timestamp);
        emit VerdictRecorded(reportHash,report.intentHash,report.solver,reason,signatures.length);
    }

    function _classify(ExecutionReport calldata report) private view returns(FaultReason){
        if(report.actualAmountOut<report.minimumAmountOut)return FaultReason.BELOW_MINIMUM;
        if(report.observedRouteHash!=report.signedRouteHash)return FaultReason.INVALID_ROUTE;
        if(report.observedExecutionHash!=report.expectedExecutionHash)return FaultReason.FRAUDULENT_RECEIPT;
        if(report.gasUsed*BPS>report.estimatedGas*(BPS+maxGasOverrunBps)||report.priceImpactBps>maxPriceImpactBps||report.marketDeviationBps>maxMarketDeviationBps)return FaultReason.QUALITY_BREACH;
        return FaultReason.NONE;
    }

    function setAttester(address attester,bool enabled) external onlyOwner{if(attester==address(0))revert ZeroAddress();attesterEnabled[attester]=enabled;emit AttesterUpdated(attester,enabled);}
    function setPolicy(uint256 quorum_,uint256 gasOverrunBps_,uint256 priceImpactBps_,uint256 deviationBps_) external onlyOwner{_setPolicy(quorum_,gasOverrunBps_,priceImpactBps_,deviationBps_);}
    function _setPolicy(uint256 quorum_,uint256 gasOverrunBps_,uint256 priceImpactBps_,uint256 deviationBps_) private{if(quorum_==0||quorum_>16||gasOverrunBps_>BPS||priceImpactBps_>BPS||deviationBps_>BPS)revert InvalidPolicy();quorum=quorum_;maxGasOverrunBps=gasOverrunBps_;maxPriceImpactBps=priceImpactBps_;maxMarketDeviationBps=deviationBps_;emit PolicyUpdated(quorum_,gasOverrunBps_,priceImpactBps_,deviationBps_);}
    function setGuardian(address newGuardian) external onlyOwner{if(newGuardian==address(0))revert ZeroAddress();emit GuardianUpdated(guardian,newGuardian);guardian=newGuardian;}
    function setPaused(bool value) external{if(value){if(msg.sender!=guardian&&msg.sender!=owner)revert Unauthorized();}else if(msg.sender!=owner)revert Unauthorized();paused=value;emit PauseUpdated(value);}
    function transferOwnership(address newOwner) external onlyOwner{if(newOwner==address(0))revert ZeroAddress();pendingOwner=newOwner;emit OwnershipTransferStarted(owner,newOwner);}
    function acceptOwnership() external{if(msg.sender!=pendingOwner)revert Unauthorized();address previousOwner=owner;owner=msg.sender;pendingOwner=address(0);emit OwnershipTransferred(previousOwner,msg.sender);}
    function _recover(bytes32 digest,bytes calldata signature) private pure returns(address signer){if(signature.length!=65)revert InvalidSignature();bytes32 r;bytes32 s;uint8 v;assembly{r:=calldataload(signature.offset)s:=calldataload(add(signature.offset,32))v:=byte(0,calldataload(add(signature.offset,64)))}if(uint256(s)>SECP256K1N_HALF||(v!=27&&v!=28))revert InvalidSignature();signer=ecrecover(digest,v,r,s);if(signer==address(0))revert InvalidSignature();}
}
