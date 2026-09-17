// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCSettlementIntentHub {
    function acceptSettler() external;
    function settlementTerms(bytes32 intentHash)
        external
        view
        returns (uint8 status, uint256 deadline, uint256 destinationChainId);
    function beginSettlement(bytes32 intentHash, address solver, bytes32 reportHash, uint256 actualAmountOut) external;
    function finalizeSettlement(bytes32 intentHash, bytes32 destinationTxHash) external;
    function rejectSettlement(bytes32 intentHash) external;
}

interface ILQCSettlementExecutionVerifier {
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

    function hashReport(ExecutionReport calldata report) external view returns (bytes32);
    function verdicts(bytes32 reportHash)
        external
        view
        returns (bytes32 intentHash, address solver, uint8 reason, uint256 verifiedAt);
}

interface ILQCSettlementSolverRegistry {
    function openExposure(bytes32 intentHash, address solver, uint256 amount) external;
    function closeExposure(bytes32 intentHash) external;
}

interface ILQCSettlementFinalityVerifier {
    function verifiedFinality(bytes32 attestationHash)
        external
        view
        returns (
            uint256 destinationChainId,
            bytes32 transactionHash,
            bytes32 blockHash,
            bytes32 canonicalReceiptHash,
            uint256 observedBlock,
            uint256 finalizedBlock,
            uint256 verifiedAt
        );
}

/// @notice Challenge-delayed reimbursement coordinator for verified Intent execution reports.
/// @dev It never holds user or Solver funds. Source assets remain in SourceEscrow until finalization.
contract LQCSettlementHub {
    uint256 public constant MIN_CHALLENGE_PERIOD = 1 hours;
    uint256 public constant MAX_CHALLENGE_PERIOD = 7 days;

    enum SettlementStatus {
        NONE,
        RESERVED,
        PROPOSED,
        CHALLENGED,
        FINALIZED,
        EXPIRED
    }

    struct Settlement {
        address solver;
        bytes32 reportHash;
        bytes32 transactionHash;
        bytes32 canonicalReceiptHash;
        bytes32 challengeReportHash;
        bytes32 finalityHash;
        uint256 actualAmountOut;
        uint256 proposedAt;
        uint256 challengeDeadline;
        uint256 exposureAmount;
        uint256 reservationDeadline;
        SettlementStatus status;
    }

    address public immutable intentHub;
    address public immutable executionVerifier;
    address public immutable solverRegistry;
    address public immutable finalityVerifier;
    address public owner;
    address public pendingOwner;
    address public guardian;
    address public operator;
    uint256 public challengePeriod;
    bool public paused;

    mapping(bytes32 intentHash => Settlement) private settlements;
    mapping(bytes32 transactionHash => bool used) public transactionUsed;
    mapping(bytes32 receiptHash => bool used) public receiptUsed;

    event SettlementProposed(
        bytes32 indexed intentHash,
        bytes32 indexed reportHash,
        address indexed solver,
        bytes32 transactionHash,
        uint256 actualAmountOut,
        uint256 challengeDeadline
    );
    event SettlementReserved(
        bytes32 indexed intentHash,
        address indexed solver,
        uint256 exposureAmount,
        uint256 reservationDeadline
    );
    event SettlementChallenged(bytes32 indexed intentHash, bytes32 indexed reportHash, bytes32 indexed challengeReportHash);
    event SettlementFinalized(bytes32 indexed intentHash, bytes32 indexed reportHash, address indexed solver);
    event SettlementReservationExpired(bytes32 indexed intentHash, address indexed solver, uint256 exposureAmount);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event ChallengePeriodUpdated(uint256 previousPeriod, uint256 newPeriod);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PauseUpdated(bool paused);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidPolicy();
    error InvalidEvidence();
    error InvalidState();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error EvidenceAlreadyUsed();
    error Paused();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    constructor(
        address intentHub_,
        address executionVerifier_,
        address solverRegistry_,
        address finalityVerifier_,
        address owner_,
        address guardian_,
        address operator_,
        uint256 challengePeriod_
    ) {
        if (
            intentHub_ == address(0) || executionVerifier_ == address(0) || solverRegistry_ == address(0)
                || finalityVerifier_ == address(0) || owner_ == address(0) || guardian_ == address(0)
                || operator_ == address(0)
        ) revert ZeroAddress();
        if (
            intentHub_.code.length == 0 || executionVerifier_.code.length == 0
                || solverRegistry_.code.length == 0 || finalityVerifier_.code.length == 0
        ) revert InvalidEvidence();
        intentHub = intentHub_;
        executionVerifier = executionVerifier_;
        solverRegistry = solverRegistry_;
        finalityVerifier = finalityVerifier_;
        owner = owner_;
        guardian = guardian_;
        operator = operator_;
        _setChallengePeriod(challengePeriod_);
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
        emit OperatorUpdated(address(0), operator_);
    }

    function getSettlement(bytes32 intentHash) external view returns (Settlement memory) {
        return settlements[intentHash];
    }

    function acceptHubRole() external onlyOwner {
        ILQCSettlementIntentHub(intentHub).acceptSettler();
    }

    /// @notice Reserves risk-adjusted Solver capacity before destination-chain execution begins.
    function reserveSettlement(
        bytes32 intentHash,
        address solver,
        uint256 exposureAmount,
        uint256 reservationDeadline
    ) external onlyOperator {
        if (paused) revert Paused();
        if (
            intentHash == bytes32(0) || solver == address(0) || exposureAmount == 0
                || reservationDeadline <= block.timestamp
        ) revert InvalidEvidence();
        Settlement storage settlement = settlements[intentHash];
        if (settlement.status != SettlementStatus.NONE) revert InvalidState();
        (uint8 intentStatus, uint256 intentDeadline,) =
            ILQCSettlementIntentHub(intentHub).settlementTerms(intentHash);
        if (intentStatus != 1 || reservationDeadline > intentDeadline) revert InvalidState();

        ILQCSettlementSolverRegistry(solverRegistry).openExposure(intentHash, solver, exposureAmount);
        settlement.solver = solver;
        settlement.exposureAmount = exposureAmount;
        settlement.reservationDeadline = reservationDeadline;
        settlement.status = SettlementStatus.RESERVED;
        emit SettlementReserved(intentHash, solver, exposureAmount, reservationDeadline);
    }

    function proposeSettlement(
        ILQCSettlementExecutionVerifier.ExecutionReport calldata report,
        bytes32 finalityHash
    )
        external
        returns (bytes32 reportHash)
    {
        if (paused) revert Paused();
        if (report.intentHash == bytes32(0) || report.solver == address(0)) revert InvalidEvidence();
        Settlement storage settlement = settlements[report.intentHash];
        if (settlement.status != SettlementStatus.RESERVED) revert InvalidState();
        if (block.timestamp > settlement.reservationDeadline || report.solver != settlement.solver) {
            revert InvalidEvidence();
        }

        reportHash = ILQCSettlementExecutionVerifier(executionVerifier).hashReport(report);
        (bytes32 verifiedIntent, address verifiedSolver, uint8 reason, uint256 verifiedAt) =
            ILQCSettlementExecutionVerifier(executionVerifier).verdicts(reportHash);
        if (
            verifiedAt == 0 || reason != 0 || verifiedIntent != report.intentHash || verifiedSolver != report.solver
                || report.transactionHash == bytes32(0) || report.canonicalReceiptHash == bytes32(0)
        ) revert InvalidEvidence();
        (, , uint256 destinationChainId) =
            ILQCSettlementIntentHub(intentHub).settlementTerms(report.intentHash);
        (
            uint256 finalityChainId,
            bytes32 finalityTransactionHash,
            bytes32 finalityBlockHash,
            bytes32 finalityReceiptHash,
            uint256 finalityObservedBlock,
            ,
            uint256 finalityVerifiedAt
        ) = ILQCSettlementFinalityVerifier(finalityVerifier).verifiedFinality(finalityHash);
        if (
            finalityVerifiedAt == 0 || finalityChainId != destinationChainId
                || finalityTransactionHash != report.transactionHash || finalityBlockHash != report.blockHash
                || finalityReceiptHash != report.canonicalReceiptHash
                || finalityObservedBlock != report.observedBlock
        ) revert InvalidEvidence();
        if (transactionUsed[report.transactionHash] || receiptUsed[report.canonicalReceiptHash]) {
            revert EvidenceAlreadyUsed();
        }

        transactionUsed[report.transactionHash] = true;
        receiptUsed[report.canonicalReceiptHash] = true;
        uint256 challengeDeadline = block.timestamp + challengePeriod;
        settlement.reportHash = reportHash;
        settlement.transactionHash = report.transactionHash;
        settlement.canonicalReceiptHash = report.canonicalReceiptHash;
        settlement.finalityHash = finalityHash;
        settlement.actualAmountOut = report.actualAmountOut;
        settlement.proposedAt = block.timestamp;
        settlement.challengeDeadline = challengeDeadline;
        settlement.status = SettlementStatus.PROPOSED;
        ILQCSettlementIntentHub(intentHub).beginSettlement(
            report.intentHash, report.solver, reportHash, report.actualAmountOut
        );
        emit SettlementProposed(
            report.intentHash,
            reportHash,
            report.solver,
            report.transactionHash,
            report.actualAmountOut,
            challengeDeadline
        );
    }

    function challengeSettlement(bytes32 intentHash, bytes32 challengeReportHash) external {
        if (paused) revert Paused();
        Settlement storage settlement = settlements[intentHash];
        if (settlement.status != SettlementStatus.PROPOSED) revert InvalidState();
        if (block.timestamp > settlement.challengeDeadline) revert ChallengeWindowClosed();
        (bytes32 verifiedIntent, address verifiedSolver, uint8 reason, uint256 verifiedAt) =
            ILQCSettlementExecutionVerifier(executionVerifier).verdicts(challengeReportHash);
        if (
            verifiedAt == 0 || reason == 0 || verifiedIntent != intentHash || verifiedSolver != settlement.solver
                || challengeReportHash == settlement.reportHash
        ) revert InvalidEvidence();

        settlement.status = SettlementStatus.CHALLENGED;
        settlement.challengeReportHash = challengeReportHash;
        ILQCSettlementIntentHub(intentHub).rejectSettlement(intentHash);
        ILQCSettlementSolverRegistry(solverRegistry).closeExposure(intentHash);
        emit SettlementChallenged(intentHash, settlement.reportHash, challengeReportHash);
    }

    function finalizeSettlement(bytes32 intentHash) external {
        if (paused) revert Paused();
        Settlement storage settlement = settlements[intentHash];
        if (settlement.status != SettlementStatus.PROPOSED) revert InvalidState();
        if (block.timestamp <= settlement.challengeDeadline) revert ChallengeWindowOpen();

        settlement.status = SettlementStatus.FINALIZED;
        ILQCSettlementIntentHub(intentHub).finalizeSettlement(intentHash, settlement.transactionHash);
        ILQCSettlementSolverRegistry(solverRegistry).closeExposure(intentHash);
        emit SettlementFinalized(intentHash, settlement.reportHash, settlement.solver);
    }

    function expireReservation(bytes32 intentHash) external {
        Settlement storage settlement = settlements[intentHash];
        if (settlement.status != SettlementStatus.RESERVED) revert InvalidState();
        if (block.timestamp <= settlement.reservationDeadline) revert ChallengeWindowOpen();
        settlement.status = SettlementStatus.EXPIRED;
        ILQCSettlementSolverRegistry(solverRegistry).closeExposure(intentHash);
        emit SettlementReservationExpired(intentHash, settlement.solver, settlement.exposureAmount);
    }

    function setChallengePeriod(uint256 newPeriod) external onlyOwner {
        _setChallengePeriod(newPeriod);
    }

    function _setChallengePeriod(uint256 newPeriod) private {
        if (newPeriod < MIN_CHALLENGE_PERIOD || newPeriod > MAX_CHALLENGE_PERIOD) revert InvalidPolicy();
        emit ChallengePeriodUpdated(challengePeriod, newPeriod);
        challengePeriod = newPeriod;
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    function setPaused(bool value) external {
        if (value) {
            if (msg.sender != guardian && msg.sender != owner) revert Unauthorized();
        } else if (msg.sender != owner) {
            revert Unauthorized();
        }
        paused = value;
        emit PauseUpdated(value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
}
