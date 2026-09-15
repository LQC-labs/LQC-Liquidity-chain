// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../contracts/libraries/SafeTransferLib.sol";

interface IERC20SolverBondBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Isolated eligibility and bond registry for the limited external-solver phase.
/// @dev It is not wired into the deployed Router 2.0 or the Gate 2 Intent Hub yet.
contract LQCIntentSolverRegistry {
    using SafeTransferLib for address;

    uint64 public constant ACTIVATION_DELAY = 1 days;
    uint64 public constant WITHDRAWAL_DELAY = 7 days;

    struct Solver {
        uint128 bond;
        uint128 pendingWithdrawal;
        uint64 activationTime;
        uint64 withdrawalAvailableAt;
        bool active;
    }

    address public immutable bondToken;
    uint256 public immutable minimumBond;
    address public admin;
    address public pendingAdmin;
    address public guardian;
    uint256 private unlocked = 1;

    mapping(address => Solver) public solvers;

    error ZeroAddress();
    error InvalidAmount();
    error Unauthorized();
    error Reentrancy();
    error InsufficientBond();
    error ActivationNotReady();
    error SolverNotScheduled();
    error WithdrawalNotReady();
    error NoPendingWithdrawal();
    error ResidualToken();

    event BondDeposited(address indexed solver, uint256 amount, uint256 totalBond);
    event SolverActivationScheduled(address indexed solver, uint256 activationTime);
    event SolverActivated(address indexed solver);
    event SolverDisabled(address indexed solver, address indexed caller);
    event WithdrawalRequested(address indexed solver, uint256 amount, uint256 availableAt);
    event WithdrawalCancelled(address indexed solver);
    event BondWithdrawn(address indexed solver, uint256 amount, uint256 remainingBond);
    event GuardianSet(address indexed oldGuardian, address indexed newGuardian);
    event AdminTransferProposed(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address bondToken_, uint256 minimumBond_, address admin_) {
        if (bondToken_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        if (minimumBond_ == 0 || minimumBond_ > type(uint128).max) revert InvalidAmount();
        bondToken = bondToken_;
        minimumBond = minimumBond_;
        admin = admin_;
        guardian = admin_;
    }

    function depositBond(uint256 amount) external nonReentrant {
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        Solver storage solver = solvers[msg.sender];
        if (uint256(solver.bond) + amount > type(uint128).max) revert InvalidAmount();

        uint256 beforeBalance = IERC20SolverBondBalance(bondToken).balanceOf(address(this));
        bondToken.safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20SolverBondBalance(bondToken).balanceOf(address(this)) - beforeBalance != amount) {
            revert ResidualToken();
        }

        solver.bond += uint128(amount);
        emit BondDeposited(msg.sender, amount, solver.bond);
    }

    function scheduleSolver(address solverAddress) external {
        if (msg.sender != admin) revert Unauthorized();
        if (solverAddress == address(0)) revert ZeroAddress();
        Solver storage solver = solvers[solverAddress];
        solver.active = false;
        solver.activationTime = uint64(block.timestamp + ACTIVATION_DELAY);
        emit SolverActivationScheduled(solverAddress, solver.activationTime);
    }

    function activateSolver(address solverAddress) external {
        Solver storage solver = solvers[solverAddress];
        if (solver.activationTime == 0) revert SolverNotScheduled();
        if (block.timestamp < solver.activationTime) revert ActivationNotReady();
        if (solver.bond < minimumBond || solver.pendingWithdrawal != 0) revert InsufficientBond();
        solver.activationTime = 0;
        solver.active = true;
        emit SolverActivated(solverAddress);
    }

    function disableSolver(address solverAddress) external {
        if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        Solver storage solver = solvers[solverAddress];
        solver.active = false;
        solver.activationTime = 0;
        emit SolverDisabled(solverAddress, msg.sender);
    }

    function requestWithdrawal(uint256 amount) external {
        Solver storage solver = solvers[msg.sender];
        if (amount == 0 || amount > solver.bond) revert InvalidAmount();
        solver.active = false;
        solver.activationTime = 0;
        solver.pendingWithdrawal = uint128(amount);
        solver.withdrawalAvailableAt = uint64(block.timestamp + WITHDRAWAL_DELAY);
        emit WithdrawalRequested(msg.sender, amount, solver.withdrawalAvailableAt);
    }

    function cancelWithdrawal() external {
        Solver storage solver = solvers[msg.sender];
        if (solver.pendingWithdrawal == 0) revert NoPendingWithdrawal();
        solver.pendingWithdrawal = 0;
        solver.withdrawalAvailableAt = 0;
        emit WithdrawalCancelled(msg.sender);
    }

    function withdrawBond() external nonReentrant {
        Solver storage solver = solvers[msg.sender];
        uint256 amount = solver.pendingWithdrawal;
        if (amount == 0) revert NoPendingWithdrawal();
        if (block.timestamp < solver.withdrawalAvailableAt) revert WithdrawalNotReady();

        solver.pendingWithdrawal = 0;
        solver.withdrawalAvailableAt = 0;
        solver.bond -= uint128(amount);
        bondToken.safeTransfer(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount, solver.bond);
    }

    function canExecute(address solverAddress, uint256 exposure) external view returns (bool) {
        Solver storage solver = solvers[solverAddress];
        return solver.active && solver.pendingWithdrawal == 0 && exposure <= solver.bond;
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
