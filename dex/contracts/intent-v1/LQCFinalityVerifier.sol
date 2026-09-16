// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Quorum-attested, chain-specific destination finality evidence for Intent settlement.
contract LQCFinalityVerifier {
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "FinalityAttestation(uint256 destinationChainId,bytes32 transactionHash,bytes32 blockHash,bytes32 canonicalReceiptHash,uint256 observedBlock,uint256 finalizedBlock,uint256 observedAt,uint256 validUntil)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("LQC Finality Verifier");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct ChainPolicy {
        uint64 minConfirmations;
        uint64 maxObservationAge;
        bool enabled;
    }

    struct FinalityAttestation {
        uint256 destinationChainId;
        bytes32 transactionHash;
        bytes32 blockHash;
        bytes32 canonicalReceiptHash;
        uint256 observedBlock;
        uint256 finalizedBlock;
        uint256 observedAt;
        uint256 validUntil;
    }

    struct VerifiedFinality {
        uint256 destinationChainId;
        bytes32 transactionHash;
        bytes32 blockHash;
        bytes32 canonicalReceiptHash;
        uint256 observedBlock;
        uint256 finalizedBlock;
        uint256 verifiedAt;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    uint256 public quorum;
    bool public paused;
    mapping(uint256 chainId => ChainPolicy) public chainPolicies;
    mapping(address attester => bool enabled) public attesterEnabled;
    mapping(bytes32 attestationHash => VerifiedFinality) public verifiedFinality;

    event FinalityVerified(
        bytes32 indexed attestationHash,
        uint256 indexed destinationChainId,
        bytes32 indexed transactionHash,
        uint256 observedBlock,
        uint256 finalizedBlock,
        uint256 signerCount
    );
    event ChainPolicyUpdated(uint256 indexed chainId, uint256 minConfirmations, uint256 maxObservationAge, bool enabled);
    event AttesterUpdated(address indexed attester, bool enabled);
    event QuorumUpdated(uint256 previousQuorum, uint256 newQuorum);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PauseUpdated(bool paused);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidPolicy();
    error InvalidAttestation();
    error InvalidSignature();
    error AlreadyVerified();
    error Paused();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address guardian_, uint256 quorum_) {
        if (owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        if (quorum_ == 0 || quorum_ > 16) revert InvalidPolicy();
        owner = owner_;
        guardian = guardian_;
        quorum = quorum_;
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
        emit QuorumUpdated(0, quorum_);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function hashAttestation(FinalityAttestation calldata attestation) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(abi.encode(ATTESTATION_TYPEHASH, attestation))
            )
        );
    }

    function submitAttestation(FinalityAttestation calldata attestation, bytes[] calldata signatures)
        external
        returns (bytes32 attestationHash)
    {
        if (paused) revert Paused();
        ChainPolicy memory policy = chainPolicies[attestation.destinationChainId];
        if (
            !policy.enabled || attestation.transactionHash == bytes32(0) || attestation.blockHash == bytes32(0)
                || attestation.canonicalReceiptHash == bytes32(0) || attestation.observedBlock == 0
                || attestation.finalizedBlock < attestation.observedBlock
                || attestation.finalizedBlock - attestation.observedBlock < policy.minConfirmations
                || attestation.observedAt > block.timestamp
                || block.timestamp - attestation.observedAt > policy.maxObservationAge
                || block.timestamp > attestation.validUntil
        ) revert InvalidAttestation();
        if (signatures.length < quorum || signatures.length > 16) revert InvalidSignature();

        attestationHash = hashAttestation(attestation);
        if (verifiedFinality[attestationHash].verifiedAt != 0) revert AlreadyVerified();
        address previous;
        for (uint256 index; index < signatures.length; ++index) {
            address signer = _recover(attestationHash, signatures[index]);
            if (!attesterEnabled[signer] || signer <= previous) revert InvalidSignature();
            previous = signer;
        }
        verifiedFinality[attestationHash] = VerifiedFinality({
            destinationChainId: attestation.destinationChainId,
            transactionHash: attestation.transactionHash,
            blockHash: attestation.blockHash,
            canonicalReceiptHash: attestation.canonicalReceiptHash,
            observedBlock: attestation.observedBlock,
            finalizedBlock: attestation.finalizedBlock,
            verifiedAt: block.timestamp
        });
        emit FinalityVerified(
            attestationHash,
            attestation.destinationChainId,
            attestation.transactionHash,
            attestation.observedBlock,
            attestation.finalizedBlock,
            signatures.length
        );
    }

    function setChainPolicy(uint256 chainId, uint256 minConfirmations, uint256 maxObservationAge, bool enabled)
        external
        onlyOwner
    {
        if (
            chainId == 0 || minConfirmations == 0 || minConfirmations > 1_000_000 || maxObservationAge < 60
                || maxObservationAge > 7 days
        ) revert InvalidPolicy();
        chainPolicies[chainId] = ChainPolicy(uint64(minConfirmations), uint64(maxObservationAge), enabled);
        emit ChainPolicyUpdated(chainId, minConfirmations, maxObservationAge, enabled);
    }

    function setAttester(address attester, bool enabled) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        attesterEnabled[attester] = enabled;
        emit AttesterUpdated(attester, enabled);
    }

    function setQuorum(uint256 newQuorum) external onlyOwner {
        if (newQuorum == 0 || newQuorum > 16) revert InvalidPolicy();
        emit QuorumUpdated(quorum, newQuorum);
        quorum = newQuorum;
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function setPaused(bool value) external {
        if (value) {
            if (msg.sender != guardian && msg.sender != owner) revert Unauthorized();
        } else if (msg.sender != owner) revert Unauthorized();
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

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
