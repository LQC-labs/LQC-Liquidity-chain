// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface ILQCExecutionVerifierVerdict {
    function verdicts(bytes32 reportHash) external view returns (bytes32 intentHash, address solver, uint8 reason, uint256 verifiedAt);
}

/// @notice Gate-4 bonded Solver registry with bounded exposure and delayed withdrawals.
contract LQCSolverRegistry {
    using SafeTransferLib for address;

    uint256 public constant WITHDRAWAL_DELAY = 7 days;
    uint256 public constant CHALLENGE_WINDOW = 7 days;
    uint256 public constant BPS = 10_000;

    enum SlashReason { NONE, NON_DELIVERY, BELOW_MINIMUM, INVALID_ROUTE, FRAUDULENT_RECEIPT, QUALITY_BREACH }

    struct Challenge {
        bytes32 intentHash;
        bytes32 evidenceHash;
        bytes32 canonicalProofHash;
        address solver;
        address challenger;
        uint256 filedAt;
        SlashReason reason;
        bool resolved;
        bool upheld;
    }

    struct SolverState {
        uint256 bond;
        uint256 exposure;
        uint256 exposureLimit;
        uint256 pendingWithdrawal;
        uint256 withdrawalAvailableAt;
        bool enabled;
    }

    address public immutable bondToken;
    address public owner;
    address public pendingOwner;
    address public guardian;
    address public exposureManager;
    address public resolver;
    address public slashRecipient;
    address public executionVerifier;
    uint256 public minimumBond;
    uint256 public challengeBond;
    bool public paused;

    mapping(address solver => SolverState) private solvers;
    mapping(bytes32 intentHash => address solver) public exposureSolver;
    mapping(bytes32 intentHash => uint256 amount) public exposureAmount;
    mapping(bytes32 intentHash => address solver) public intentSolver;
    mapping(bytes32 intentHash => uint256 closedAt) public exposureClosedAt;
    mapping(bytes32 challengeId => Challenge) public challenges;
    mapping(bytes32 evidenceHash => bool used) public evidenceUsed;
    mapping(address solver => uint256 count) public activeChallenges;

    event BondDeposited(address indexed solver, uint256 amount, uint256 totalBond);
    event WithdrawalRequested(address indexed solver, uint256 amount, uint256 availableAt);
    event WithdrawalCancelled(address indexed solver);
    event BondWithdrawn(address indexed solver, uint256 amount);
    event SolverConfigured(address indexed solver, bool enabled, uint256 exposureLimit);
    event ExposureOpened(bytes32 indexed intentHash, address indexed solver, uint256 amount);
    event ExposureClosed(bytes32 indexed intentHash, address indexed solver, uint256 amount);
    event ChallengeFiled(bytes32 indexed challengeId, bytes32 indexed intentHash, address indexed solver, address challenger, SlashReason reason, bytes32 evidenceHash);
    event ChallengeResolved(bytes32 indexed challengeId, address indexed solver, bool upheld, uint256 slashedAmount);
    event MinimumBondUpdated(uint256 previousMinimum, uint256 newMinimum);
    event ExposureManagerUpdated(address indexed previousManager, address indexed newManager);
    event ResolverUpdated(address indexed previousResolver, address indexed newResolver);
    event SlashRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event ChallengeBondUpdated(uint256 previousBond, uint256 newBond);
    event ExecutionVerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PauseUpdated(bool paused);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidAmount();
    error InvalidState();
    error IneligibleSolver();
    error ExposureExceeded();
    error WithdrawalLocked();
    error ChallengeUnavailable();
    error Paused();

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier onlyExposureManager() { if (msg.sender != exposureManager) revert Unauthorized(); _; }

    constructor(address bondToken_, address owner_, address guardian_, uint256 minimumBond_) {
        if (bondToken_ == address(0) || owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        if (bondToken_.code.length == 0 || minimumBond_ == 0) revert InvalidAmount();
        bondToken = bondToken_;
        owner = owner_;
        guardian = guardian_;
        resolver = owner_;
        slashRecipient = owner_;
        minimumBond = minimumBond_;
        challengeBond = minimumBond_ / 100 == 0 ? 1 : minimumBond_ / 100;
        emit OwnershipTransferred(address(0), owner_);
    }

    function getSolver(address solver) external view returns (SolverState memory) { return solvers[solver]; }

    function isSolverEligible(address solver, uint256 additionalExposure) external view returns (bool) {
        SolverState storage state = solvers[solver];
        return !paused && state.enabled && state.pendingWithdrawal == 0 && state.bond >= minimumBond
            && additionalExposure <= state.exposureLimit - state.exposure;
    }

    function depositBond(uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        bondToken.safeTransferFrom(msg.sender, address(this), amount);
        solvers[msg.sender].bond += amount;
        emit BondDeposited(msg.sender, amount, solvers[msg.sender].bond);
    }

    function requestWithdrawal(uint256 amount) external {
        SolverState storage state = solvers[msg.sender];
        if (amount == 0 || amount > state.bond || state.pendingWithdrawal != 0 || state.exposure != 0 || activeChallenges[msg.sender] != 0) revert InvalidState();
        state.pendingWithdrawal = amount;
        state.withdrawalAvailableAt = block.timestamp + WITHDRAWAL_DELAY;
        emit WithdrawalRequested(msg.sender, amount, state.withdrawalAvailableAt);
    }

    function cancelWithdrawal() external {
        SolverState storage state = solvers[msg.sender];
        if (state.pendingWithdrawal == 0) revert InvalidState();
        state.pendingWithdrawal = 0;
        state.withdrawalAvailableAt = 0;
        emit WithdrawalCancelled(msg.sender);
    }

    function withdrawBond() external {
        SolverState storage state = solvers[msg.sender];
        uint256 amount = state.pendingWithdrawal;
        if (amount == 0 || block.timestamp < state.withdrawalAvailableAt || state.exposure != 0 || activeChallenges[msg.sender] != 0) revert WithdrawalLocked();
        state.pendingWithdrawal = 0;
        state.withdrawalAvailableAt = 0;
        state.bond -= amount;
        bondToken.safeTransfer(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount);
    }

    function openExposure(bytes32 intentHash, address solver, uint256 amount) external onlyExposureManager {
        if (paused) revert Paused();
        if (intentHash == bytes32(0) || amount == 0 || exposureSolver[intentHash] != address(0)) revert InvalidState();
        SolverState storage state = solvers[solver];
        if (!state.enabled || state.pendingWithdrawal != 0 || state.bond < minimumBond) revert IneligibleSolver();
        if (amount > state.exposureLimit - state.exposure) revert ExposureExceeded();
        state.exposure += amount;
        exposureSolver[intentHash] = solver;
        exposureAmount[intentHash] = amount;
        intentSolver[intentHash] = solver;
        emit ExposureOpened(intentHash, solver, amount);
    }

    function closeExposure(bytes32 intentHash) external onlyExposureManager {
        address solver = exposureSolver[intentHash];
        uint256 amount = exposureAmount[intentHash];
        if (solver == address(0) || amount == 0) revert InvalidState();
        solvers[solver].exposure -= amount;
        delete exposureSolver[intentHash];
        delete exposureAmount[intentHash];
        exposureClosedAt[intentHash] = block.timestamp;
        emit ExposureClosed(intentHash, solver, amount);
    }

    /// @dev evidenceHash binds the challenger, preventing copied-proof front running.
    function fileChallenge(bytes32 intentHash, SlashReason reason, bytes32 canonicalProofHash)
        external
        returns (bytes32 challengeId)
    {
        address solver = intentSolver[intentHash];
        uint256 closedAt = exposureClosedAt[intentHash];
        if (solver == address(0) || closedAt == 0 || block.timestamp > closedAt + CHALLENGE_WINDOW) revert ChallengeUnavailable();
        if (reason == SlashReason.NONE || canonicalProofHash == bytes32(0)) revert ChallengeUnavailable();
        bytes32 evidenceHash = keccak256(abi.encode(intentHash, solver, msg.sender, reason, canonicalProofHash));
        if (evidenceUsed[evidenceHash]) revert ChallengeUnavailable();
        challengeId = keccak256(abi.encode(intentHash, solver, msg.sender, reason, evidenceHash));
        if (challenges[challengeId].filedAt != 0) revert ChallengeUnavailable();
        bondToken.safeTransferFrom(msg.sender, address(this), challengeBond);
        evidenceUsed[evidenceHash] = true;
        activeChallenges[solver] += 1;
        challenges[challengeId] = Challenge(intentHash, evidenceHash, canonicalProofHash, solver, msg.sender, block.timestamp, reason, false, false);
        emit ChallengeFiled(challengeId, intentHash, solver, msg.sender, reason, evidenceHash);
    }

    function resolveChallenge(bytes32 challengeId, bool upheld, uint256 slashBps) external {
        if (msg.sender != resolver) revert Unauthorized();
        _resolveChallenge(challengeId, upheld, slashBps);
    }

    function resolveChallengeWithVerifier(bytes32 challengeId, uint256 slashBps) external {
        Challenge storage challenge = challenges[challengeId];
        address verifier = executionVerifier;
        if (verifier == address(0)) revert ChallengeUnavailable();
        (bytes32 intentHash, address solver, uint8 reason, uint256 verifiedAt) =
            ILQCExecutionVerifierVerdict(verifier).verdicts(challenge.canonicalProofHash);
        if (verifiedAt == 0 || intentHash != challenge.intentHash || solver != challenge.solver || reason != uint8(challenge.reason)) {
            revert ChallengeUnavailable();
        }
        _resolveChallenge(challengeId, true, slashBps);
    }

    function _resolveChallenge(bytes32 challengeId, bool upheld, uint256 slashBps) private {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.filedAt == 0 || challenge.resolved) revert ChallengeUnavailable();
        if ((upheld && (slashBps == 0 || slashBps > BPS)) || (!upheld && slashBps != 0)) revert InvalidAmount();
        challenge.resolved = true;
        challenge.upheld = upheld;
        activeChallenges[challenge.solver] -= 1;

        uint256 slashedAmount;
        if (upheld) {
            SolverState storage state = solvers[challenge.solver];
            slashedAmount = state.bond * slashBps / BPS;
            if (slashedAmount == 0) revert InvalidAmount();
            state.bond -= slashedAmount;
            if (state.pendingWithdrawal > state.bond) {
                state.pendingWithdrawal = state.bond;
                if (state.pendingWithdrawal == 0) state.withdrawalAvailableAt = 0;
            }
            bondToken.safeTransfer(challenge.challenger, challengeBond);
            bondToken.safeTransfer(slashRecipient, slashedAmount);
        } else {
            bondToken.safeTransfer(slashRecipient, challengeBond);
        }
        emit ChallengeResolved(challengeId, challenge.solver, upheld, slashedAmount);
    }

    function configureSolver(address solver, bool enabled, uint256 exposureLimit) external onlyOwner {
        if (solver == address(0)) revert ZeroAddress();
        SolverState storage state = solvers[solver];
        if (exposureLimit < state.exposure) revert ExposureExceeded();
        state.enabled = enabled;
        state.exposureLimit = exposureLimit;
        emit SolverConfigured(solver, enabled, exposureLimit);
    }

    function setMinimumBond(uint256 newMinimum) external onlyOwner {
        if (newMinimum == 0) revert InvalidAmount();
        emit MinimumBondUpdated(minimumBond, newMinimum);
        minimumBond = newMinimum;
    }

    function setExposureManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert ZeroAddress();
        emit ExposureManagerUpdated(exposureManager, newManager);
        exposureManager = newManager;
    }

    function setResolver(address newResolver) external onlyOwner {
        if (newResolver == address(0)) revert ZeroAddress();
        emit ResolverUpdated(resolver, newResolver);
        resolver = newResolver;
    }

    function setSlashRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit SlashRecipientUpdated(slashRecipient, newRecipient);
        slashRecipient = newRecipient;
    }

    function setChallengeBond(uint256 newBond) external onlyOwner {
        if (newBond == 0) revert InvalidAmount();
        emit ChallengeBondUpdated(challengeBond, newBond);
        challengeBond = newBond;
    }

    function setExecutionVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert ZeroAddress();
        if (newVerifier.code.length == 0) revert InvalidState();
        emit ExecutionVerifierUpdated(executionVerifier, newVerifier);
        executionVerifier = newVerifier;
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function setPaused(bool value) external {
        if (value) { if (msg.sender != guardian && msg.sender != owner) revert Unauthorized(); }
        else if (msg.sender != owner) revert Unauthorized();
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
