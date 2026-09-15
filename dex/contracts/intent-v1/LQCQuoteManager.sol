// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Gate-3 verifier and deterministic selector for short-lived Solver quotes.
/// @dev The temporary owner allowlist is intentionally replaced by SolverRegistry in Gate 4.
contract LQCQuoteManager {
    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "SolverQuote(bytes32 intentHash,address solver,bytes32 dexId,uint256 amountOut,uint256 solverFeeOut,uint256 gasCostOut,bytes32 routeHash,uint256 issuedAt,uint256 deadline,uint256 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("LQC Solver Quote Manager");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint256 public constant MAX_QUOTE_LIFETIME = 120;
    uint256 public constant MAX_QUOTES = 16;

    struct SolverQuote {
        bytes32 intentHash;
        address solver;
        bytes32 dexId;
        uint256 amountOut;
        uint256 solverFeeOut;
        uint256 gasCostOut;
        bytes32 routeHash;
        uint256 issuedAt;
        uint256 deadline;
        uint256 nonce;
    }

    struct Selection {
        uint256 index;
        address solver;
        bytes32 quoteHash;
        uint256 amountOut;
        uint256 netAmountOut;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    bool public paused;
    mapping(address solver => bool allowed) public solverAllowed;

    event SolverPermissionUpdated(address indexed solver, bool allowed);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PauseUpdated(bool paused);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error Paused();
    error InvalidQuote();
    error InvalidSignature();
    error InvalidQuoteCount();
    error DuplicateSolver();
    error NoValidQuote();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address guardian_) {
        if (owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function hashQuote(SolverQuote calldata quote) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), _structHash(quote)));
    }

    function selectBestQuote(
        bytes32 intentHash,
        uint256 minimumAmountOut,
        SolverQuote[] calldata quotes,
        bytes[] calldata signatures
    ) external view returns (Selection memory selected) {
        if (paused) revert Paused();
        uint256 length = quotes.length;
        if (intentHash == bytes32(0) || minimumAmountOut == 0) revert InvalidQuote();
        if (length < 2 || length > MAX_QUOTES || signatures.length != length) revert InvalidQuoteCount();

        bool found;
        for (uint256 i; i < length; ++i) {
            SolverQuote calldata quote = quotes[i];
            for (uint256 j; j < i; ++j) if (quotes[j].solver == quote.solver) revert DuplicateSolver();
            (bool valid, bytes32 quoteHash) = _validateQuote(intentHash, minimumAmountOut, quote, signatures[i]);
            if (!valid) continue;
            uint256 netAmountOut = quote.amountOut - quote.solverFeeOut - quote.gasCostOut;
            if (!found || netAmountOut > selected.netAmountOut || (netAmountOut == selected.netAmountOut && quoteHash < selected.quoteHash)) {
                found = true;
                selected = Selection(i, quote.solver, quoteHash, quote.amountOut, netAmountOut);
            }
        }
        if (!found) revert NoValidQuote();
    }

    function verifyQuote(
        bytes32 intentHash,
        uint256 minimumAmountOut,
        SolverQuote calldata quote,
        bytes calldata signature
    ) external view returns (bytes32 quoteHash, uint256 netAmountOut) {
        if (paused) revert Paused();
        if (intentHash == bytes32(0) || minimumAmountOut == 0) revert InvalidQuote();
        (bool valid, bytes32 verifiedHash) = _validateQuote(intentHash, minimumAmountOut, quote, signature);
        if (!valid) revert InvalidQuote();
        quoteHash = verifiedHash;
        netAmountOut = quote.amountOut - quote.solverFeeOut - quote.gasCostOut;
    }

    function setSolverAllowed(address solver, bool allowed) external onlyOwner {
        if (solver == address(0)) revert ZeroAddress();
        solverAllowed[solver] = allowed;
        emit SolverPermissionUpdated(solver, allowed);
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

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
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

    function _validateQuote(bytes32 intentHash, uint256 minimumAmountOut, SolverQuote calldata quote, bytes calldata signature)
        private
        view
        returns (bool valid, bytes32 quoteHash)
    {
        if (!solverAllowed[quote.solver] || quote.intentHash != intentHash || quote.dexId == bytes32(0) || quote.routeHash == bytes32(0)) return (false, bytes32(0));
        if (quote.amountOut < minimumAmountOut || quote.solverFeeOut >= quote.amountOut || quote.gasCostOut >= quote.amountOut - quote.solverFeeOut) return (false, bytes32(0));
        if (quote.issuedAt > block.timestamp || quote.deadline < quote.issuedAt || block.timestamp > quote.deadline || quote.deadline - quote.issuedAt > MAX_QUOTE_LIFETIME) return (false, bytes32(0));
        quoteHash = hashQuote(quote);
        valid = _recover(quoteHash, signature) == quote.solver;
    }

    function _structHash(SolverQuote calldata quote) private pure returns (bytes32) {
        return keccak256(abi.encode(QUOTE_TYPEHASH, quote.intentHash, quote.solver, quote.dexId, quote.amountOut, quote.solverFeeOut, quote.gasCostOut, quote.routeHash, quote.issuedAt, quote.deadline, quote.nonce));
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset, 32)) v := byte(0, calldataload(add(signature.offset, 64))) }
        if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) return address(0);
        signer = ecrecover(digest, v, r, s);
    }
}
