// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LocalFuturesSequentialEpochGateV2 as Gate} from "./LocalFuturesSequentialEpochGateV2.sol";
import {LocalFuturesV2OwnerCoreAdapter as Core} from "./LocalFuturesV2OwnerCoreAdapter.sol";

/** Official Pyth Pro on-chain verifier's minimal callable ABI. */
interface IPythProSignedUpdateVerifier {
    function verification_fee() external view returns (uint256);
    function verifyUpdate(bytes calldata update)
        external payable returns (bytes memory verifiedPayload, address signer);
}

/**
 * A SEPARATELY AUDITED parser is needed to decode the payload that was returned
 * by Pyth Pro's verifyUpdate. A parser must never authenticate raw input alone.
 * The supplied test implementation is deliberately NOT production-capable.
 */
interface IVerifiedPythProPayloadReader {
    struct Prices {
        uint32 marketFeedId;
        uint32 collateralFeedId;
        uint64 payloadTimestampUs;
        uint64 marketFeedTimestampUs;
        uint64 collateralFeedTimestampUs;
        uint256 marketPrice18;
        uint256 collateralPrice18;
    }

    function readVerifiedPrices(bytes calldata verifiedPayload, uint32 marketId, uint32 collateralId)
        external view returns (Prices memory);
}

/**
 * @notice Isolated EIP-712 two-of-three exit attestation PLUS Pyth Pro ABI gate.
 * @dev Signatures authenticate ONLY an approved local witness quorum.
 *      This contract calls the exact Pyth Pro on-chain verifyUpdate ABI and
 *      requires its returned payload to match the signed observation and a
 *      pinned payload reader's two distinct feed readouts. A reader must be
 *      independently audited and the official verifier address confirmed.
 *      No collateral, funding, payout or production settlement is implemented.
 */
contract LocalFuturesV2PythProBoundExitVerifier {
    error Forbidden();
    error Invalid();
    error AlreadyBound();
    error Unbound();
    error CoreMismatch();
    error PolicyMismatch();
    error ObservationMismatch();
    error StaleObservation();
    error InvalidQuorum();
    error InvalidSignature();
    error DuplicateSigner();
    error Replay();
    error OracleFeeMismatch();
    error OracleDecoderMismatch();
    error OracleProofInvalid();
    error OracleFeedMismatch();
    error OracleValueMismatch();
    error OracleStale();

    struct ExitObservation {
        uint256 domain;
        address owner;
        uint256 pid;
        uint32 epoch;
        uint64 exitTime;
        uint64 marketUpdatedAt;
        uint64 collateralUpdatedAt;
        uint256 marketPrice18;
        uint256 collateralPrice18;
        bytes32 policyDigest;
        bytes32 salt;
        bytes32 proPayloadHash;
    }

    bytes32 public constant EXIT_TYPEHASH = keccak256(
        "ExitObservation(uint256 domain,address owner,uint256 pid,uint32 epoch,uint64 exitTime,uint64 marketUpdatedAt,uint64 collateralUpdatedAt,uint256 marketPrice18,uint256 collateralPrice18,bytes32 policyDigest,bytes32 salt,bytes32 proPayloadHash)"
    );
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("LQC Local Futures Exit Attestation");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant MAX_LOW_S =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable administrator;
    address[3] public approvedSigners;
    uint64 public immutable maxEvidenceAge;
    uint64 public immutable maxPriceAge;
    uint64 public immutable maxOracleSkew;
    IPythProSignedUpdateVerifier public immutable pythPro;
    IVerifiedPythProPayloadReader public immutable payloadReader;
    bytes32 public immutable payloadReaderCodeHash;
    uint32 public immutable marketFeedId;
    uint32 public immutable collateralFeedId;

    Core public core;
    mapping(uint256 => bytes32) public domainPolicy;
    mapping(bytes32 => bool) public consumedAttestation;

    event CoreBound(address indexed core);
    event DomainPolicyFixed(uint256 indexed domain, bytes32 policyDigest);
    event ExitAttested(uint256 indexed domain, address indexed owner, uint256 indexed pid, bytes32 digest);

    constructor(
        address[3] memory signers_, uint64 evidenceAge_, uint64 priceAge_, uint64 skew_,
        address pyth_, address reader_, uint32 marketId_, uint32 collateralId_
    ) {
        if (evidenceAge_ == 0 || priceAge_ == 0 || skew_ > priceAge_ ||
            pyth_ == address(0) || reader_ == address(0) ||
            pyth_.code.length == 0 || reader_.code.length == 0 ||
            marketId_ == 0 || collateralId_ == 0 || marketId_ == collateralId_) revert Invalid();
        for (uint256 i; i < signers_.length; i++) {
            if (signers_[i] == address(0)) revert Invalid();
            for (uint256 j; j < i; j++) {
                if (signers_[i] == signers_[j]) revert Invalid();
            }
        }
        administrator = msg.sender;
        approvedSigners = signers_;
        maxEvidenceAge = evidenceAge_;
        maxPriceAge = priceAge_;
        maxOracleSkew = skew_;
        pythPro = IPythProSignedUpdateVerifier(pyth_);
        payloadReader = IVerifiedPythProPayloadReader(reader_);
        payloadReaderCodeHash = reader_.codehash;
        marketFeedId = marketId_;
        collateralFeedId = collateralId_;
    }

    function bindCore(address candidate_) external {
        if (msg.sender != administrator) revert Forbidden();
        if (address(core) != address(0)) revert AlreadyBound();
        if (candidate_ == address(0) || candidate_.code.length == 0) revert Invalid();
        Core candidate = Core(candidate_);
        Gate bound = candidate.gate();
        if (candidate.exitVerifier() != address(this) ||
            address(bound) == address(0) || bound.tradingCore() != candidate_ ||
            bound.version() != 2) revert CoreMismatch();
        core = candidate;
        emit CoreBound(candidate_);
    }

    /** @dev One immutable local policy for each domain. No in-place rotation. */
    function fixDomainPolicy(uint256 domain, bytes32 digest) external {
        if (msg.sender != administrator) revert Forbidden();
        if (address(core) == address(0)) revert Unbound();
        if (domain == 0 || digest == bytes32(0) || domainPolicy[domain] != bytes32(0)) revert Invalid();
        domainPolicy[domain] = digest;
        emit DomainPolicyFixed(domain, digest);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)
        ));
    }

    function observationDigest(ExitObservation calldata o) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            EXIT_TYPEHASH, o.domain, o.owner, o.pid, o.epoch, o.exitTime,
            o.marketUpdatedAt, o.collateralUpdatedAt, o.marketPrice18,
            o.collateralPrice18, o.policyDigest, o.salt, o.proPayloadHash
        ));
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(), structHash));
    }

    function submitExit(
        ExitObservation calldata o, bytes[] calldata signatures, bytes calldata signedProUpdate
    ) external payable {
        Core bound = core;
        if (address(bound) == address(0)) revert Unbound();
        if (domainPolicy[o.domain] == bytes32(0) ||
            domainPolicy[o.domain] != o.policyDigest) revert PolicyMismatch();
        bytes32 digest = observationDigest(o);
        if (consumedAttestation[digest]) revert Replay();

        Core.CorePosition memory cp = bound.corePosition(o.pid);
        Gate.PositionProgress memory gp = bound.gate().position(o.pid);
        if (o.domain == 0 || o.owner == address(0) || o.pid == 0 || o.epoch == 0 ||
            o.salt == bytes32(0) || o.proPayloadHash == bytes32(0) ||
            cp.owner != o.owner || cp.domain != o.domain ||
            cp.epoch != o.epoch || cp.closeForwarded || gp.status != Gate.Status.Open ||
            gp.domain != o.domain || gp.owner != o.owner || gp.epoch != o.epoch) {
            revert ObservationMismatch();
        }

        if (o.exitTime <= gp.openedAt || o.exitTime > block.timestamp ||
            block.timestamp - o.exitTime > maxEvidenceAge ||
            o.marketUpdatedAt == 0 || o.collateralUpdatedAt == 0 ||
            o.marketUpdatedAt > o.exitTime || o.collateralUpdatedAt > o.exitTime ||
            o.exitTime - o.marketUpdatedAt > maxPriceAge ||
            o.exitTime - o.collateralUpdatedAt > maxPriceAge ||
            _distance(o.marketUpdatedAt, o.collateralUpdatedAt) > maxOracleSkew ||
            o.marketPrice18 == 0 || o.collateralPrice18 == 0 ||
            o.marketPrice18 > 1e24 || o.collateralPrice18 > 1e24) {
            revert StaleObservation();
        }

        if (signatures.length != 2) revert InvalidQuorum();
        uint256 signerMask;
        for (uint256 i; i < 2; i++) {
            address recovered = _recover(digest, signatures[i]);
            uint256 bit;
            for (uint256 j; j < 3; j++) {
                if (recovered == approvedSigners[j]) bit = uint256(1) << j;
            }
            if (bit == 0) revert InvalidSignature();
            if ((signerMask & bit) != 0) revert DuplicateSigner();
            signerMask |= bit;
        }

        // Mark the digest before external Pyth/reader calls. Any failure in
        // verification or the later Core/Gate transition reverts this mark.
        consumedAttestation[digest] = true;
        _verifyPythProPayload(o, signedProUpdate);
        bound.closeFromVerifier(o.pid, o.owner, digest);
        emit ExitAttested(o.domain, o.owner, o.pid, digest);
    }

    function _verifyPythProPayload(ExitObservation calldata o, bytes calldata update) private {
        uint256 fee = pythPro.verification_fee();
        if (msg.value != fee) revert OracleFeeMismatch();
        (bytes memory payload, address sourceSigner) = pythPro.verifyUpdate{value: fee}(update);
        if (sourceSigner == address(0) || payload.length == 0 ||
            keccak256(payload) != o.proPayloadHash) revert OracleProofInvalid();
        if (address(payloadReader).codehash != payloadReaderCodeHash) {
            revert OracleDecoderMismatch();
        }

        IVerifiedPythProPayloadReader.Prices memory readout =
            payloadReader.readVerifiedPrices(payload, marketFeedId, collateralFeedId);
        if (readout.marketFeedId != marketFeedId ||
            readout.collateralFeedId != collateralFeedId) revert OracleFeedMismatch();
        if (readout.marketPrice18 != o.marketPrice18 ||
            readout.collateralPrice18 != o.collateralPrice18 ||
            readout.marketFeedTimestampUs / 1e6 != o.marketUpdatedAt ||
            readout.collateralFeedTimestampUs / 1e6 != o.collateralUpdatedAt) {
            revert OracleValueMismatch();
        }

        uint256 nowUs = block.timestamp * 1e6;
        uint256 exitEndUs = uint256(o.exitTime) * 1e6 + 999999;
        if (readout.payloadTimestampUs == 0 ||
            readout.marketFeedTimestampUs == 0 || readout.collateralFeedTimestampUs == 0 ||
            readout.payloadTimestampUs > nowUs ||
            nowUs - readout.payloadTimestampUs > uint256(maxEvidenceAge) * 1e6 ||
            readout.payloadTimestampUs > exitEndUs ||
            readout.marketFeedTimestampUs > readout.payloadTimestampUs ||
            readout.collateralFeedTimestampUs > readout.payloadTimestampUs ||
            nowUs - readout.marketFeedTimestampUs > uint256(maxPriceAge) * 1e6 ||
            nowUs - readout.collateralFeedTimestampUs > uint256(maxPriceAge) * 1e6 ||
            _distance(readout.marketFeedTimestampUs, readout.collateralFeedTimestampUs)
                > uint256(maxOracleSkew) * 1e6) revert OracleStale();
    }

    function _distance(uint64 a, uint64 b) private pure returns (uint64) {
        return a >= b ? a - b : b - a;
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address recovered) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (r == bytes32(0) || s == bytes32(0) || uint256(s) > MAX_LOW_S ||
            (v != 27 && v != 28)) revert InvalidSignature();
        recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSignature();
    }
}
