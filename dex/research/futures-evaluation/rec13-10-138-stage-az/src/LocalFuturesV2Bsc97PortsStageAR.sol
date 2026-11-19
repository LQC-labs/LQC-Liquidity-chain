// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @notice REC-13.10.130 / Stage AR: a mock-import-free interface boundary.
 * @dev An implementation MUST authenticate the external venue execution and
 *      token movements before setting finalized. These interfaces do not do so.
 *      All quantities are 18-decimal normalized units, not raw ERC20 units.
 */
interface ILQCVenueExecutionPortStageAR {
    struct ExecutionReceipt {
        bytes32 tradeId;
        bytes32 positionKey;
        address account;
        address quoteToken;
        address baseToken;
        uint256 quoteSpent18;
        uint256 baseReceived18;
        uint256 feePaid18;
        bytes32 executionEvidence;
        uint64 executedAt;
        bool finalized;
    }

    function executionOf(bytes32 tradeId)
        external view returns (ExecutionReceipt memory);
}

/**
 * @notice A prospective real custody adapter must reconcile actual token
 *         balances and irrevocable settlement before reporting finalized.
 */
interface ILQCCollateralCustodyPortStageAR {
    struct CustodyReceipt {
        bytes32 positionKey;
        address account;
        address collateralToken;
        uint256 principalLocked18;
        uint256 payout18;
        bytes32 custodyEvidence;
        uint64 recordedAt;
        bool finalized;
    }

    function custodyOf(bytes32 positionKey)
        external view returns (CustodyReceipt memory);
}

/**
 * @notice BSC97 read-only, mock-import-free binding and consistency checker.
 * @dev Caller-supplied expected hashes MUST originate from a separately
 *      authenticated source. This contract does NOT establish provenance of
 *      those hashes, independently verify Pyth, execute swaps, hold assets,
 *      or approve deployment. Matching codehashes are NOT an audit certificate.
 *      The authentic-venue / Pyth / custody production adapter remains BLOCKED.
 */
contract LocalFuturesV2Bsc97PortBindingStageAR {
    error WrongChain();
    error InvalidConfig();
    error PortCodeChanged();
    error InvalidRequest();
    error ReceiptMismatch();
    error ReceiptNotFinal();
    error ReceiptExpired();
    error ReceiptOverFeeCap();
    error ReceiptDigestMismatch();

    struct BindingConfig {
        address venuePort;
        address custodyPort;
        address quoteToken;
        address baseToken;
        address collateralToken;
        bytes32 venueCodehash;
        bytes32 custodyCodehash;
        uint16 maxFeeBps;
        uint64 maxAgeSeconds;
    }

    address public immutable venuePort;
    address public immutable custodyPort;
    address public immutable quoteToken;
    address public immutable baseToken;
    address public immutable collateralToken;
    bytes32 public immutable approvedVenueCodehash;
    bytes32 public immutable approvedCustodyCodehash;
    uint16 public immutable maxFeeBps;
    uint64 public immutable maxAgeSeconds;

    constructor(BindingConfig memory cfg) {
        if (block.chainid != 97) revert WrongChain();
        if (cfg.venuePort == address(0) || cfg.custodyPort == address(0) ||
            cfg.venuePort == cfg.custodyPort ||
            cfg.quoteToken == address(0) || cfg.baseToken == address(0) ||
            cfg.collateralToken == address(0) || cfg.quoteToken == cfg.baseToken ||
            cfg.venuePort.code.length == 0 || cfg.custodyPort.code.length == 0 ||
            cfg.quoteToken.code.length == 0 || cfg.baseToken.code.length == 0 ||
            cfg.collateralToken.code.length == 0 ||
            cfg.venueCodehash == bytes32(0) || cfg.custodyCodehash == bytes32(0) ||
            cfg.venuePort.codehash != cfg.venueCodehash ||
            cfg.custodyPort.codehash != cfg.custodyCodehash ||
            cfg.maxFeeBps == 0 || cfg.maxFeeBps > 1000 ||
            cfg.maxAgeSeconds == 0 || cfg.maxAgeSeconds > 86400) revert InvalidConfig();

        venuePort = cfg.venuePort;
        custodyPort = cfg.custodyPort;
        quoteToken = cfg.quoteToken;
        baseToken = cfg.baseToken;
        collateralToken = cfg.collateralToken;
        approvedVenueCodehash = cfg.venueCodehash;
        approvedCustodyCodehash = cfg.custodyCodehash;
        maxFeeBps = cfg.maxFeeBps;
        maxAgeSeconds = cfg.maxAgeSeconds;
    }

    function verifyBoundReceipts(
        bytes32 tradeId,
        bytes32 positionKey,
        bytes32 expectedExecutionDigest,
        bytes32 expectedCustodyDigest
    ) external view returns (bytes32 bindingCommitment) {
        if (tradeId == bytes32(0) || positionKey == bytes32(0) ||
            expectedExecutionDigest == bytes32(0) ||
            expectedCustodyDigest == bytes32(0)) revert InvalidRequest();
        if (venuePort.codehash != approvedVenueCodehash ||
            custodyPort.codehash != approvedCustodyCodehash)
            revert PortCodeChanged();

        ILQCVenueExecutionPortStageAR.ExecutionReceipt memory execution =
            ILQCVenueExecutionPortStageAR(venuePort).executionOf(tradeId);
        ILQCCollateralCustodyPortStageAR.CustodyReceipt memory custody =
            ILQCCollateralCustodyPortStageAR(custodyPort).custodyOf(positionKey);

        if (!execution.finalized || !custody.finalized) revert ReceiptNotFinal();
        if (execution.tradeId != tradeId || execution.positionKey != positionKey ||
            custody.positionKey != positionKey ||
            execution.account == address(0) || execution.account != custody.account ||
            execution.quoteToken != quoteToken || execution.baseToken != baseToken ||
            custody.collateralToken != collateralToken ||
            execution.quoteSpent18 == 0 || execution.baseReceived18 == 0 ||
            custody.principalLocked18 == 0 ||
            execution.executionEvidence == bytes32(0) ||
            custody.custodyEvidence == bytes32(0)) revert ReceiptMismatch();
        if (execution.executedAt == 0 || custody.recordedAt == 0 ||
            uint256(execution.executedAt) > block.timestamp ||
            uint256(custody.recordedAt) > block.timestamp ||
            block.timestamp - uint256(execution.executedAt) > maxAgeSeconds ||
            block.timestamp - uint256(custody.recordedAt) > maxAgeSeconds)
            revert ReceiptExpired();
        if (execution.feePaid18 > execution.quoteSpent18 * maxFeeBps / 10000)
            revert ReceiptOverFeeCap();

        bytes32 actualExecutionDigest = keccak256(abi.encode(execution));
        bytes32 actualCustodyDigest = keccak256(abi.encode(custody));
        if (actualExecutionDigest != expectedExecutionDigest ||
            actualCustodyDigest != expectedCustodyDigest)
            revert ReceiptDigestMismatch();

        bindingCommitment = keccak256(abi.encode(
            "LQC_REC130_RESEARCH_ONLY_PORT_BINDING_V1",
            block.chainid, address(this), venuePort, custodyPort,
            approvedVenueCodehash, approvedCustodyCodehash,
            actualExecutionDigest, actualCustodyDigest
        ));
    }
}
