// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LocalFuturesSequentialEpochGateV2 as Gate} from "./LocalFuturesSequentialEpochGateV2.sol";

/**
 * @notice Isolated V2 Core entry-point prototype. This is NOT the historic V1 TradingCore.
 * @dev Open is bound to the EVM caller, while close is accepted only from a
 *      separately pinned exit verifier contract. It has NO margin, price,
 *      funding, accounting, liquidation, settlement or asset-transfer logic.
 *      The verifier must independently authenticate observations; this adapter
 *      cannot establish oracle truth. Never use as a production trading core.
 */
contract LocalFuturesV2OwnerCoreAdapter {
    error Forbidden();
    error Invalid();
    error AlreadyBound();
    error Unbound();
    error GateMismatch();
    error WrongOwner();
    error AlreadyClosed();

    struct CorePosition {
        address owner;
        uint256 domain;
        uint32 epoch;
        bool closeForwarded;
    }

    address public immutable administrator;
    address public immutable exitVerifier;
    Gate public gate;

    mapping(uint256 => CorePosition) private corePositions;

    event Bound(address indexed gate);
    event OwnerOpened(uint256 indexed domain, address indexed owner, uint256 indexed pid, uint32 epoch);
    event VerifiedExitForwarded(uint256 indexed pid, bytes32 evidenceCommitment);

    constructor(address verifier_) {
        if (verifier_ == address(0) || verifier_.code.length == 0) revert Invalid();
        administrator = msg.sender;
        exitVerifier = verifier_;
    }

    function bindGate(address gate_) external {
        if (msg.sender != administrator) revert Forbidden();
        if (address(gate) != address(0)) revert AlreadyBound();
        if (gate_ == address(0) || gate_.code.length == 0) revert Invalid();
        Gate candidate = Gate(gate_);
        if (candidate.version() != 2 || candidate.tradingCore() != address(this)) {
            revert GateMismatch();
        }
        gate = candidate;
        emit Bound(gate_);
    }

    /** @notice The caller may open only their OWN position on the isolated gate. */
    function openForSelf(uint256 domain, uint256 pid, uint32 epoch) external {
        Gate bound = _gate();
        if (domain == 0 || pid == 0 || epoch == 0 || corePositions[pid].owner != address(0)) {
            revert Invalid();
        }
        // A failed Gate transition reverts the entire operation atomically.
        bound.recordOpen(domain, msg.sender, pid, epoch);
        corePositions[pid] = CorePosition(msg.sender, domain, epoch, false);
        emit OwnerOpened(domain, msg.sender, pid, epoch);
    }

    /**
     * @notice An independent verifier contract forwards an exit commitment.
     * @dev This function pins ONLY verifier identity and owner/position binding.
     *      The attestor's price proof, age, finality, policy, and domain binding
     *      are NOT validated here and are required before any real use.
     */
    function closeFromVerifier(uint256 pid, address expectedOwner, bytes32 evidenceCommitment) external {
        if (msg.sender != exitVerifier) revert Forbidden();
        CorePosition storage position_ = corePositions[pid];
        if (position_.owner == address(0) || position_.owner != expectedOwner) revert WrongOwner();
        if (position_.closeForwarded) revert AlreadyClosed();
        _gate().recordClose(position_.domain, position_.owner, pid, evidenceCommitment);
        position_.closeForwarded = true;
        emit VerifiedExitForwarded(pid, evidenceCommitment);
    }

    function corePosition(uint256 pid) external view returns (CorePosition memory) {
        return corePositions[pid];
    }

    function _gate() private view returns (Gate bound) {
        bound = gate;
        if (address(bound) == address(0)) revert Unbound();
    }
}
