// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

/// @notice Gate-4 bonded Solver registry with bounded exposure and delayed withdrawals.
contract LQCSolverRegistry {
    using SafeTransferLib for address;

    uint256 public constant WITHDRAWAL_DELAY = 7 days;

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
    uint256 public minimumBond;
    bool public paused;

    mapping(address solver => SolverState) private solvers;
    mapping(bytes32 intentHash => address solver) public exposureSolver;
    mapping(bytes32 intentHash => uint256 amount) public exposureAmount;

    event BondDeposited(address indexed solver, uint256 amount, uint256 totalBond);
    event WithdrawalRequested(address indexed solver, uint256 amount, uint256 availableAt);
    event WithdrawalCancelled(address indexed solver);
    event BondWithdrawn(address indexed solver, uint256 amount);
    event SolverConfigured(address indexed solver, bool enabled, uint256 exposureLimit);
    event ExposureOpened(bytes32 indexed intentHash, address indexed solver, uint256 amount);
    event ExposureClosed(bytes32 indexed intentHash, address indexed solver, uint256 amount);
    event MinimumBondUpdated(uint256 previousMinimum, uint256 newMinimum);
    event ExposureManagerUpdated(address indexed previousManager, address indexed newManager);
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
    error Paused();

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier onlyExposureManager() { if (msg.sender != exposureManager) revert Unauthorized(); _; }

    constructor(address bondToken_, address owner_, address guardian_, uint256 minimumBond_) {
        if (bondToken_ == address(0) || owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        if (bondToken_.code.length == 0 || minimumBond_ == 0) revert InvalidAmount();
        bondToken = bondToken_;
        owner = owner_;
        guardian = guardian_;
        minimumBond = minimumBond_;
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
        if (amount == 0 || amount > state.bond || state.pendingWithdrawal != 0 || state.exposure != 0) revert InvalidState();
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
        if (amount == 0 || block.timestamp < state.withdrawalAvailableAt || state.exposure != 0) revert WithdrawalLocked();
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
        emit ExposureOpened(intentHash, solver, amount);
    }

    function closeExposure(bytes32 intentHash) external onlyExposureManager {
        address solver = exposureSolver[intentHash];
        uint256 amount = exposureAmount[intentHash];
        if (solver == address(0) || amount == 0) revert InvalidState();
        solvers[solver].exposure -= amount;
        delete exposureSolver[intentHash];
        delete exposureAmount[intentHash];
        emit ExposureClosed(intentHash, solver, amount);
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
