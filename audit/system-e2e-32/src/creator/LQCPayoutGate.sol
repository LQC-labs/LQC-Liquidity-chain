// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ICreatorRecoveryRelay {
    function governance() external view returns (address);
    function payout() external view returns (address);
}

interface ICreatorGateVault {
    function activationAuthority() external view returns (address);
}

contract LQCPayoutGate {
    address public immutable vault;
    address public immutable risk;
    address public immutable guardian;
    bool public held = true;
    uint256 public epoch;

    struct Permit { uint256 epoch; uint64 until; }
    mapping(bytes32 => Permit) public permits;
    mapping(bytes32 => bool) public used;

    uint256 public policyVersion = 1;
    mapping(bytes32 => bytes32) public permitEvidence;
    uint256 public recoveryNonce;
    event EvidencePermitted(bytes32 indexed digest, uint256 indexed policy, bytes32 indexed evidence, uint256 epoch, uint64 until);
    event PolicyChanged(uint256 indexed policy, uint256 epoch);

    error Unauthorized();
    error HeldOrUnapproved();
    event HoldChanged(bool held, uint256 epoch);
    event Permitted(bytes32 indexed digest, uint256 epoch, uint64 until);

    constructor(address vault_, address risk_, address guardian_) {
        if (vault_.code.length == 0 || risk_ == address(0) || guardian_ == address(0) ||
            risk_ == guardian_ || risk_ == vault_ || guardian_ == vault_) revert Unauthorized();
        vault = vault_;
        risk = risk_;
        guardian = guardian_;
    }

    function setHold(bool next) external {
        if (!next || (msg.sender != risk && msg.sender != guardian)) revert Unauthorized();
        held = true;
        emit HoldChanged(true, ++epoch);
    }

    /// @notice Only the configured relay may carry out a Governance recovery.
    function recoverHold(uint256 policy, uint256 expectedEpoch, uint256 expectedNonce) external {
        if (msg.sender != guardian || msg.sender.code.length == 0 ||
            ICreatorRecoveryRelay(msg.sender).payout() != address(this) ||
            ICreatorRecoveryRelay(msg.sender).governance() != ICreatorGateVault(vault).activationAuthority()) revert Unauthorized();
        if (!held || policy != policyVersion || expectedEpoch != epoch || expectedNonce != recoveryNonce) revert HeldOrUnapproved();
        held = false;
        ++recoveryNonce;
        emit HoldChanged(false, ++epoch);
    }

    // Legacy selector remains callable but cannot issue an unbound permit.
    function permit(bytes32, uint64) external pure { revert HeldOrUnapproved(); }

    function advancePolicy(uint256 next) external {
        if (msg.sender != risk) revert Unauthorized();
        if (next <= policyVersion) revert HeldOrUnapproved();
        policyVersion = next;
        ++epoch;
        emit PolicyChanged(next, epoch);
    }

    function permitWithEvidence(bytes32 digest, uint256 policy, uint256 expectedEpoch, bytes32 evidence, uint64 until)
        external
    {
        if (msg.sender != risk) revert Unauthorized();
        if (held || digest == bytes32(0) || evidence == bytes32(0) || used[digest] ||
            policy != policyVersion || expectedEpoch != epoch || until <= block.timestamp ||
            until > block.timestamp + 120) revert HeldOrUnapproved();
        permits[digest] = Permit(epoch, until);
        permitEvidence[digest] = evidence;
        emit Permitted(digest, epoch, until);
        emit EvidencePermitted(digest, policy, evidence, epoch, until);
    }

    function isPermitted(bytes32 digest) public view returns (bool) {
        Permit memory entry = permits[digest];
        return !held && permitEvidence[digest] != bytes32(0) && !used[digest] && entry.epoch == epoch && entry.until > block.timestamp;
    }

    function consume(bytes32 digest) external {
        if (msg.sender != vault) revert Unauthorized();
        if (!isPermitted(digest)) revert HeldOrUnapproved();
        used[digest] = true;
        delete permits[digest];
    }
}
