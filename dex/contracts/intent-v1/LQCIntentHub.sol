// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCIntentTypes} from "./LQCIntentTypes.sol";
import {LQCSourceEscrow} from "./LQCSourceEscrow.sol";

/// @notice Phase-1 LQC intent lifecycle with EIP-712 authorization and per-intent escrow.
/// @dev Cross-chain proof verification, solver auctions and challenge settlement are deliberately
///      separate later modules. The current settler is a restricted testnet bootstrap role.
contract LQCIntentHub {
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 salt)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("LQC Intent Hub");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public owner;
    address public settler;
    address public guardian;
    bool public paused;
    LQCSourceEscrow public immutable sourceEscrow;
    uint256 private unlocked = 1;

    struct IntentRecord {
        address user;
        address sourceToken;
        uint256 sourceAmount;
        uint256 deadline;
        LQCIntentTypes.IntentStatus status;
        address solver;
        bytes32 executionHash;
    }

    mapping(bytes32 intentHash => IntentRecord) private records;
    mapping(address user => mapping(uint256 nonce => bool used)) public nonceUsed;

    event IntentSubmitted(bytes32 indexed intentHash, address indexed user, uint256 indexed nonce, uint256 deadline);
    event IntentCancelled(bytes32 indexed intentHash, address indexed user);
    event IntentExpired(bytes32 indexed intentHash, address indexed user);
    event IntentSettled(bytes32 indexed intentHash, address indexed solver, bytes32 indexed executionHash);
    event SettlerUpdated(address indexed previousSettler, address indexed newSettler);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PauseUpdated(bool paused);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidIntent();
    error InvalidSignature();
    error InvalidStatus();
    error NonceAlreadyUsed();
    error Expired();
    error NotExpired();
    error Paused();
    error Reentrancy();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address owner_, address settler_, address guardian_) {
        if (owner_ == address(0) || settler_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        owner = owner_;
        settler = settler_;
        guardian = guardian_;
        sourceEscrow = new LQCSourceEscrow();
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function hashIntent(LQCIntentTypes.Intent calldata intent) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), _structHash(intent)));
    }

    function getIntent(bytes32 intentHash) external view returns (IntentRecord memory) {
        return records[intentHash];
    }

    function submitIntent(LQCIntentTypes.Intent calldata intent, bytes calldata signature)
        external
        nonReentrant
        returns (bytes32 intentHash)
    {
        if (paused) revert Paused();
        _validateIntent(intent);
        if (nonceUsed[intent.user][intent.nonce]) revert NonceAlreadyUsed();

        intentHash = hashIntent(intent);
        if (records[intentHash].status != LQCIntentTypes.IntentStatus.NONE) revert InvalidStatus();
        if (_recover(intentHash, signature) != intent.user) revert InvalidSignature();

        nonceUsed[intent.user][intent.nonce] = true;
        records[intentHash] = IntentRecord({
            user: intent.user,
            sourceToken: intent.sourceToken,
            sourceAmount: intent.sourceAmount,
            deadline: intent.deadline,
            status: LQCIntentTypes.IntentStatus.OPEN,
            solver: address(0),
            executionHash: bytes32(0)
        });
        sourceEscrow.lockFrom(intentHash, intent.user, intent.sourceToken, intent.sourceAmount);

        emit IntentSubmitted(intentHash, intent.user, intent.nonce, intent.deadline);
    }

    function cancelIntent(bytes32 intentHash) external nonReentrant {
        IntentRecord storage record = records[intentHash];
        if (record.status != LQCIntentTypes.IntentStatus.OPEN) revert InvalidStatus();
        if (msg.sender != record.user) revert Unauthorized();
        record.status = LQCIntentTypes.IntentStatus.CANCELLED;
        sourceEscrow.refund(intentHash);
        emit IntentCancelled(intentHash, record.user);
    }

    function expireIntent(bytes32 intentHash) external nonReentrant {
        IntentRecord storage record = records[intentHash];
        if (record.status != LQCIntentTypes.IntentStatus.OPEN) revert InvalidStatus();
        if (block.timestamp <= record.deadline) revert NotExpired();
        record.status = LQCIntentTypes.IntentStatus.EXPIRED;
        sourceEscrow.refund(intentHash);
        emit IntentExpired(intentHash, record.user);
    }

    /// @notice Testnet bootstrap settlement. Replaced by SettlementHub + ExecutionVerifier later.
    function settleIntent(bytes32 intentHash, address solver, bytes32 executionHash)
        external
        onlySettler
        nonReentrant
    {
        if (paused) revert Paused();
        if (solver == address(0) || executionHash == bytes32(0)) revert InvalidIntent();
        IntentRecord storage record = records[intentHash];
        if (record.status != LQCIntentTypes.IntentStatus.OPEN) revert InvalidStatus();
        if (block.timestamp > record.deadline) revert Expired();

        record.status = LQCIntentTypes.IntentStatus.EXECUTED;
        record.solver = solver;
        record.executionHash = executionHash;
        sourceEscrow.release(intentHash, solver);
        emit IntentSettled(intentHash, solver, executionHash);
    }

    function setSettler(address newSettler) external onlyOwner {
        if (newSettler == address(0)) revert ZeroAddress();
        emit SettlerUpdated(settler, newSettler);
        settler = newSettler;
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function setPaused(bool value) external {
        if (msg.sender != guardian && msg.sender != owner) revert Unauthorized();
        paused = value;
        emit PauseUpdated(value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _validateIntent(LQCIntentTypes.Intent calldata intent) private view {
        if (
            intent.user == address(0) || intent.sourceToken == address(0) || intent.destinationToken == address(0)
                || intent.recipient == address(0)
        ) revert ZeroAddress();
        if (
            intent.sourceAmount == 0 || intent.minAmountOut == 0 || intent.sourceChainId != block.chainid
                || intent.destinationChainId == 0 || intent.salt == bytes32(0)
        ) revert InvalidIntent();
        if (block.timestamp > intent.deadline) revert Expired();
    }

    function _structHash(LQCIntentTypes.Intent calldata intent) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                intent.user,
                intent.sourceChainId,
                intent.sourceToken,
                intent.sourceAmount,
                intent.destinationChainId,
                intent.destinationToken,
                intent.recipient,
                intent.minAmountOut,
                intent.deadline,
                intent.nonce,
                intent.salt
            )
        );
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
