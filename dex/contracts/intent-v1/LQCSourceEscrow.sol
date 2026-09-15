// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IERC20EscrowBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Per-intent source-asset custody for LQC Intent v1.
/// @dev The deploying IntentHub is the immutable controller. Shared liquidity and bridge custody
///      are intentionally outside this contract.
contract LQCSourceEscrow {
    using SafeTransferLib for address;

    address public immutable controller;

    struct Deposit {
        address user;
        address token;
        uint256 amount;
        bool active;
    }

    mapping(bytes32 intentHash => Deposit) private deposits;

    event SourceLocked(bytes32 indexed intentHash, address indexed user, address indexed token, uint256 amount);
    event SourceReleased(bytes32 indexed intentHash, address indexed solver, address indexed token, uint256 amount);
    event SourceRefunded(bytes32 indexed intentHash, address indexed user, address indexed token, uint256 amount);

    error OnlyController();
    error ZeroAddress();
    error InvalidAmount();
    error DepositExists();
    error DepositNotActive();
    error UnsupportedToken();

    modifier onlyController() {
        if (msg.sender != controller) revert OnlyController();
        _;
    }

    constructor() {
        controller = msg.sender;
    }

    function getDeposit(bytes32 intentHash) external view returns (Deposit memory) {
        return deposits[intentHash];
    }

    function lockFrom(bytes32 intentHash, address user, address token, uint256 amount) external onlyController {
        if (user == address(0) || token == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (deposits[intentHash].active) revert DepositExists();

        uint256 beforeBalance = IERC20EscrowBalance(token).balanceOf(address(this));
        token.safeTransferFrom(user, address(this), amount);
        if (IERC20EscrowBalance(token).balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedToken();

        deposits[intentHash] = Deposit({user: user, token: token, amount: amount, active: true});
        emit SourceLocked(intentHash, user, token, amount);
    }

    function release(bytes32 intentHash, address solver) external onlyController {
        if (solver == address(0)) revert ZeroAddress();
        Deposit memory deposit = _consume(intentHash);
        deposit.token.safeTransfer(solver, deposit.amount);
        emit SourceReleased(intentHash, solver, deposit.token, deposit.amount);
    }

    function refund(bytes32 intentHash) external onlyController {
        Deposit memory deposit = _consume(intentHash);
        deposit.token.safeTransfer(deposit.user, deposit.amount);
        emit SourceRefunded(intentHash, deposit.user, deposit.token, deposit.amount);
    }

    function _consume(bytes32 intentHash) private returns (Deposit memory deposit) {
        deposit = deposits[intentHash];
        if (!deposit.active) revert DepositNotActive();
        deposits[intentHash].active = false;
    }
}
