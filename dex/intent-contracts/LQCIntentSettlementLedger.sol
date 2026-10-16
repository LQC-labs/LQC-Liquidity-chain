// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCIntentExposureRegistry {
    function reserveExposure(address solver, uint256 amount) external;
    function releaseExposure(address solver, uint256 amount) external;
}

/// @notice Tracks unsettled solver exposure and prevents duplicate settlement.
/// @dev Gate 4 ledger only; no existing Router 2.0 or testnet deployment is modified.
contract LQCIntentSettlementLedger {
    uint64 public constant OPERATOR_ACTIVATION_DELAY = 2 days;
    uint64 public constant MAX_RESERVATION_DURATION = 7 days;

    enum Status {
        None,
        Reserved,
        Finalized,
        Released
    }

    struct Settlement {
        bytes32 intentId;
        bytes32 quoteHash;
        bytes32 proofHash;
        address solver;
        uint128 exposure;
        uint64 expiresAt;
        Status status;
    }

    address public immutable solverRegistry;
    address public admin;
    address public pendingAdmin;
    address public guardian;
    address public operator;
    address public pendingOperator;
    uint64 public operatorActivationTime;
    bool public reservationsPaused;
    uint256 private unlocked = 1;

    mapping(bytes32 => Settlement) public settlements;
    mapping(bytes32 => bytes32) public activeIntentSettlement;
    mapping(bytes32 => bool) public finalizedIntent;
    mapping(bytes32 => bool) public consumedQuote;
    mapping(bytes32 => bool) public consumedProof;

    error ZeroAddress();
    error Unauthorized();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidStatus();
    error DuplicateIntent();
    error DuplicateQuote();
    error DuplicateProof();
    error ReservationsPaused();
    error OperatorNotReady();
    error NotExpired();
    error Reentrancy();

    event SettlementReserved(
        bytes32 indexed settlementId,
        bytes32 indexed intentId,
        bytes32 indexed quoteHash,
        address solver,
        uint256 exposure,
        uint256 expiresAt
    );
    event SettlementFinalized(
        bytes32 indexed settlementId,
        bytes32 indexed intentId,
        bytes32 indexed proofHash
    );
    event SettlementReleased(bytes32 indexed settlementId, bytes32 indexed intentId, bool expired);
    event ReservationsPausedSet(bool paused, address indexed caller);
    event OperatorScheduled(address indexed operator, uint256 activationTime);
    event OperatorActivated(address indexed operator);
    event OperatorDisabled(address indexed operator, address indexed caller);
    event GuardianSet(address indexed oldGuardian, address indexed newGuardian);
    event AdminTransferProposed(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address solverRegistry_, address admin_) {
        if (solverRegistry_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        solverRegistry = solverRegistry_;
        admin = admin_;
        guardian = admin_;
    }

    function reserveSettlement(
        bytes32 settlementId,
        bytes32 intentId,
        bytes32 quoteHash,
        address solver,
        uint256 exposure,
        uint256 expiresAt
    ) external nonReentrant {
        if (msg.sender != operator) revert Unauthorized();
        if (reservationsPaused) revert ReservationsPaused();
        if (settlementId == bytes32(0) || intentId == bytes32(0) || quoteHash == bytes32(0)) {
            revert InvalidStatus();
        }
        if (solver == address(0)) revert ZeroAddress();
        if (exposure == 0 || exposure > type(uint128).max) revert InvalidAmount();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_RESERVATION_DURATION) {
            revert InvalidDeadline();
        }
        if (settlements[settlementId].status != Status.None) revert InvalidStatus();
        if (finalizedIntent[intentId] || activeIntentSettlement[intentId] != bytes32(0)) {
            revert DuplicateIntent();
        }
        if (consumedQuote[quoteHash]) revert DuplicateQuote();

        settlements[settlementId] = Settlement({
            intentId: intentId,
            quoteHash: quoteHash,
            proofHash: bytes32(0),
            solver: solver,
            exposure: uint128(exposure),
            expiresAt: uint64(expiresAt),
            status: Status.Reserved
        });
        activeIntentSettlement[intentId] = settlementId;
        consumedQuote[quoteHash] = true;
        ILQCIntentExposureRegistry(solverRegistry).reserveExposure(solver, exposure);

        emit SettlementReserved(settlementId, intentId, quoteHash, solver, exposure, expiresAt);
    }

    function finalizeSettlement(bytes32 settlementId, bytes32 proofHash) external nonReentrant {
        if (msg.sender != operator) revert Unauthorized();
        if (proofHash == bytes32(0)) revert InvalidStatus();
        if (consumedProof[proofHash]) revert DuplicateProof();

        Settlement storage settlement = settlements[settlementId];
        if (settlement.status != Status.Reserved) revert InvalidStatus();
        if (block.timestamp > settlement.expiresAt) revert InvalidDeadline();

        settlement.status = Status.Finalized;
        settlement.proofHash = proofHash;
        activeIntentSettlement[settlement.intentId] = bytes32(0);
        finalizedIntent[settlement.intentId] = true;
        consumedProof[proofHash] = true;
        ILQCIntentExposureRegistry(solverRegistry).releaseExposure(
            settlement.solver, settlement.exposure
        );

        emit SettlementFinalized(settlementId, settlement.intentId, proofHash);
    }

    function releaseSettlement(bytes32 settlementId) external nonReentrant {
        if (msg.sender != operator) revert Unauthorized();
        _release(settlementId, false);
    }

    function releaseExpiredSettlement(bytes32 settlementId) external nonReentrant {
        Settlement storage settlement = settlements[settlementId];
        if (settlement.status != Status.Reserved) revert InvalidStatus();
        if (block.timestamp <= settlement.expiresAt) revert NotExpired();
        _release(settlementId, true);
    }

    function _release(bytes32 settlementId, bool expired) private {
        Settlement storage settlement = settlements[settlementId];
        if (settlement.status != Status.Reserved) revert InvalidStatus();

        settlement.status = Status.Released;
        activeIntentSettlement[settlement.intentId] = bytes32(0);
        ILQCIntentExposureRegistry(solverRegistry).releaseExposure(
            settlement.solver, settlement.exposure
        );
        emit SettlementReleased(settlementId, settlement.intentId, expired);
    }

    function pauseReservations() external {
        if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        reservationsPaused = true;
        emit ReservationsPausedSet(true, msg.sender);
    }

    function resumeReservations() external {
        if (msg.sender != admin) revert Unauthorized();
        reservationsPaused = false;
        emit ReservationsPausedSet(false, msg.sender);
    }

    function scheduleOperator(address newOperator) external {
        if (msg.sender != admin) revert Unauthorized();
        if (newOperator == address(0)) revert ZeroAddress();
        pendingOperator = newOperator;
        operatorActivationTime = uint64(block.timestamp + OPERATOR_ACTIVATION_DELAY);
        emit OperatorScheduled(newOperator, operatorActivationTime);
    }

    function activateOperator() external {
        address newOperator = pendingOperator;
        if (newOperator == address(0) || block.timestamp < operatorActivationTime) {
            revert OperatorNotReady();
        }
        operator = newOperator;
        pendingOperator = address(0);
        operatorActivationTime = 0;
        emit OperatorActivated(newOperator);
    }

    function disableOperator() external {
        if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        address oldOperator = operator;
        operator = address(0);
        pendingOperator = address(0);
        operatorActivationTime = 0;
        emit OperatorDisabled(oldOperator, msg.sender);
    }

    function setGuardian(address newGuardian) external {
        if (msg.sender != admin) revert Unauthorized();
        if (newGuardian == address(0)) revert ZeroAddress();
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianSet(oldGuardian, newGuardian);
    }

    function proposeAdmin(address newAdmin) external {
        if (msg.sender != admin) revert Unauthorized();
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert Unauthorized();
        address oldAdmin = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(oldAdmin, msg.sender);
    }
}
