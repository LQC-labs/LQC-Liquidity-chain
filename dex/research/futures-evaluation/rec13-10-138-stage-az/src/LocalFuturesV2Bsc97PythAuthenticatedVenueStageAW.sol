// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ILQCVenueExecutionPortStageAR as VenuePort} from
    "./LocalFuturesV2Bsc97PortsStageAR.sol";
import {IVerifiedPythProPayloadReader} from
    "./LocalFuturesV2PythProBoundExitVerifier.sol";

/**
 * @notice The deployed Stage S boundary is expected to call the OFFICIAL
 *         Pyth Pro BSC97 verifyUpdate, including signature, signer and fee
 *         verification, BEFORE returning these structured price values.
 * @dev An arbitrary address implementing this interface can LIE; a caller
 *      supplied codehash alone DOES NOT attest to independent authenticity.
 */
interface IStageAWPythBoundary {
    function verifySignedPrices(bytes calldata signedUpdate) external payable
        returns (IVerifiedPythProPayloadReader.Prices memory prices);
}

/**
 * @notice Research-only read gate: actual on-chain venue receipt PLUS a
 *         separately verified Pyth Pro signed price observation.
 * @dev This adapter has no mock imports and no bypass for missing Pyth proof.
 *      In live mode it requires the independently reviewed, genuine Stage S
 *      oracle boundary. Local Foundry fixtures use an EXPLICITLY FAKE
 *      boundary to test control flow, NEVER to claim Pyth authenticity.
 *      Price/asset economic equivalence and signed freshness assumptions
 *      still require independent security audit; no deployments approved.
 */
contract LocalFuturesV2Bsc97PythAuthenticatedVenueStageAW is VenuePort {
    error WrongChain();
    error InvalidConfig();
    error SourceChanged();
    error BoundaryChanged();
    error InvalidSourceReceipt();
    error SourceReceiptChanged();
    error AlreadyWitnessed();
    error NoAuthenticatedWitness();
    error InvalidOracleReadout();
    error StaleOracle();
    error OracleExecutionSkew();
    error PriceDeviation();
    error Reentrant();

    struct Witness {
        bytes32 sourceReceiptDigest;
        bytes32 signedPayloadHash;
        bytes32 boundEvidence;
        uint64 oracleTimestampUs;
        uint256 oraclePrice18;
        uint256 impliedPrice18;
    }

    VenuePort public immutable originalVenue;
    IStageAWPythBoundary public immutable pythBoundary;
    address public immutable approvedQuoteToken;
    address public immutable approvedBaseToken;
    bytes32 public immutable approvedVenueCodehash;
    bytes32 public immutable approvedBoundaryCodehash;
    uint16 public immutable maxDeviationBps;
    uint64 public immutable maxOracleAgeSeconds;
    uint64 public immutable maxExecutionSkewSeconds;

    mapping(bytes32 => Witness) private witnesses;
    bool private entered;

    event OracleBoundExecutionWitnessed(
        bytes32 indexed tradeId, bytes32 indexed positionKey,
        bytes32 indexed boundEvidence, bytes32 signedPayloadHash,
        uint64 oracleTimestampUs, uint256 marketPrice18
    );

    modifier nonReentrant() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address originalVenue_, bytes32 originalVenueHash_,
        address boundary_, bytes32 boundaryHash_,
        address quote_, address base_,
        uint16 maxDeviationBps_, uint64 maxAgeSeconds_, uint64 maxSkewSeconds_
    ) {
        if (block.chainid != 97) revert WrongChain();
        if (originalVenue_ == address(0) || boundary_ == address(0) ||
            originalVenue_ == boundary_ || quote_ == address(0) ||
            base_ == address(0) || quote_ == base_ ||
            originalVenue_.code.length == 0 || boundary_.code.length == 0 ||
            originalVenueHash_ == bytes32(0) || boundaryHash_ == bytes32(0) ||
            originalVenue_.codehash != originalVenueHash_ ||
            boundary_.codehash != boundaryHash_ ||
            maxDeviationBps_ == 0 || maxDeviationBps_ > 2000 ||
            maxAgeSeconds_ == 0 || maxAgeSeconds_ > 120 ||
            maxSkewSeconds_ == 0 || maxSkewSeconds_ > maxAgeSeconds_)
            revert InvalidConfig();

        originalVenue = VenuePort(originalVenue_);
        pythBoundary = IStageAWPythBoundary(boundary_);
        approvedQuoteToken = quote_;
        approvedBaseToken = base_;
        approvedVenueCodehash = originalVenueHash_;
        approvedBoundaryCodehash = boundaryHash_;
        maxDeviationBps = maxDeviationBps_;
        maxOracleAgeSeconds = maxAgeSeconds_;
        maxExecutionSkewSeconds = maxSkewSeconds_;
    }

    /**
     * @notice The ONLY way a Stage AV fill gains Stage AW finality.
     * @dev Never hashes raw `signedUpdate` as if it were authenticated.
     *      The boundary MUST first return values from a genuine verified
     *      official Pyth Pro contract invocation; any failure reverts fully.
     *      Any oracle verification fee is forwarded exactly as msg.value.
     */
    function witnessSignedExecution(
        bytes32 tradeId, bytes32 positionKey,
        bytes32 expectedSourceDigest, bytes calldata signedUpdate
    ) external payable nonReentrant returns (bytes32 boundEvidence) {
        _checkChainAndSources();
        if (tradeId == bytes32(0) || positionKey == bytes32(0) ||
            expectedSourceDigest == bytes32(0) || signedUpdate.length == 0)
            revert InvalidSourceReceipt();
        if (witnesses[tradeId].boundEvidence != bytes32(0))
            revert AlreadyWitnessed();

        VenuePort.ExecutionReceipt memory e = originalVenue.executionOf(tradeId);
        if (!e.finalized || e.tradeId != tradeId || e.positionKey != positionKey ||
            e.account == address(0) || e.quoteToken != approvedQuoteToken ||
            e.baseToken != approvedBaseToken || e.executionEvidence == bytes32(0) ||
            e.quoteSpent18 == 0 || e.baseReceived18 == 0 ||
            e.feePaid18 >= e.quoteSpent18 ||
            keccak256(abi.encode(e)) != expectedSourceDigest)
            revert InvalidSourceReceipt();
        if (e.executedAt == 0 || uint256(e.executedAt) > block.timestamp)
            revert InvalidSourceReceipt();

        // No fake-byte / hash fallback: the exact update MUST pass through
        // the nominated Pyth boundary, which is pinned to its runtime hash.
        IVerifiedPythProPayloadReader.Prices memory p =
            pythBoundary.verifySignedPrices{value: msg.value}(signedUpdate);
        _checkPrices(p, uint256(e.executedAt));

        uint256 effectiveQuote18 = e.quoteSpent18 - e.feePaid18;
        // Preserve checked arithmetic; overflow never creates a valid price.
        uint256 impliedPrice18 = effectiveQuote18 * 1e18 / e.baseReceived18;
        if (impliedPrice18 == 0 || impliedPrice18 <
            p.marketPrice18 * (10000 - maxDeviationBps) / 10000 ||
            impliedPrice18 >
            p.marketPrice18 * (10000 + maxDeviationBps) / 10000)
            revert PriceDeviation();

        bytes32 payloadHash = keccak256(signedUpdate);
        boundEvidence = keccak256(abi.encode(
            "LQC_REC135_PYTH_BOUND_EXECUTION_RESEARCH_ONLY",
            block.chainid, address(this), address(originalVenue),
            address(pythBoundary), approvedVenueCodehash,
            approvedBoundaryCodehash, tradeId, positionKey,
            expectedSourceDigest, e.executionEvidence, payloadHash,
            p.marketFeedId, p.collateralFeedId,
            p.payloadTimestampUs, p.marketFeedTimestampUs,
            p.collateralFeedTimestampUs, p.marketPrice18,
            p.collateralPrice18, impliedPrice18
        ));
        witnesses[tradeId] = Witness({
            sourceReceiptDigest: expectedSourceDigest,
            signedPayloadHash: payloadHash,
            boundEvidence: boundEvidence,
            oracleTimestampUs: p.payloadTimestampUs,
            oraclePrice18: p.marketPrice18,
            impliedPrice18: impliedPrice18
        });
        emit OracleBoundExecutionWitnessed(
            tradeId, positionKey, boundEvidence,
            payloadHash, p.payloadTimestampUs, p.marketPrice18
        );
    }

    /** @notice Stage AR/AU cannot see an unwitnessed or stale venue fill. */
    function executionOf(bytes32 tradeId)
        external view returns (ExecutionReceipt memory e)
    {
        _checkChainAndSources();
        Witness memory w = witnesses[tradeId];
        if (w.boundEvidence == bytes32(0)) revert NoAuthenticatedWitness();
        uint256 nowUs = block.timestamp * 1e6;
        if (w.oracleTimestampUs == 0 || w.oracleTimestampUs > nowUs ||
            nowUs - w.oracleTimestampUs > uint256(maxOracleAgeSeconds) * 1e6)
            revert StaleOracle();
        e = originalVenue.executionOf(tradeId);
        if (!e.finalized || keccak256(abi.encode(e)) != w.sourceReceiptDigest)
            revert SourceReceiptChanged();
        // The returned receipt digest cryptographically commits to the
        // verified oracle observation, not merely the raw Stage AV receipt.
        e.executionEvidence = w.boundEvidence;
    }

    function witnessOf(bytes32 tradeId)
        external view returns (Witness memory)
    {
        _checkChainAndSources();
        return witnesses[tradeId];
    }

    function _checkPrices(
        IVerifiedPythProPayloadReader.Prices memory p, uint256 executedAt
    ) private view {
        // Stage S is the source of authenticity, but check returned IDs,
        // positivity, ordering, freshness and execution-time proximity AGAIN.
        if (p.marketFeedId != 1 || p.collateralFeedId != 2 ||
            p.marketPrice18 == 0 || p.collateralPrice18 == 0 ||
            p.marketPrice18 > 1e30 || p.collateralPrice18 > 1e30 ||
            p.payloadTimestampUs == 0 || p.marketFeedTimestampUs == 0 ||
            p.collateralFeedTimestampUs == 0 ||
            p.marketFeedTimestampUs > p.payloadTimestampUs ||
            p.collateralFeedTimestampUs > p.payloadTimestampUs)
            revert InvalidOracleReadout();
        uint256 nowUs = block.timestamp * 1e6;
        if (p.payloadTimestampUs > nowUs || p.marketFeedTimestampUs > nowUs ||
            p.collateralFeedTimestampUs > nowUs ||
            nowUs - p.payloadTimestampUs > uint256(maxOracleAgeSeconds) * 1e6 ||
            nowUs - p.marketFeedTimestampUs > uint256(maxOracleAgeSeconds) * 1e6 ||
            nowUs - p.collateralFeedTimestampUs > uint256(maxOracleAgeSeconds) * 1e6)
            revert StaleOracle();
        uint256 executedUs = executedAt * 1e6;
        uint256 distance = executedUs > p.payloadTimestampUs
            ? executedUs - p.payloadTimestampUs
            : p.payloadTimestampUs - executedUs;
        if (distance > uint256(maxExecutionSkewSeconds) * 1e6)
            revert OracleExecutionSkew();
    }

    function _checkChainAndSources() private view {
        if (block.chainid != 97) revert WrongChain();
        if (address(originalVenue).codehash != approvedVenueCodehash)
            revert SourceChanged();
        if (address(pythBoundary).codehash != approvedBoundaryCodehash)
            revert BoundaryChanged();
    }
}
