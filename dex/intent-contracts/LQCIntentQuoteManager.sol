// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCIntentSolverEligibility {
    function canExecute(address solver, uint256 exposure) external view returns (bool);
    function riskPenaltyBps(address solver) external view returns (uint16);
}

/// @notice Verifies EIP-712 solver quotes and deterministically selects the best risk-adjusted output.
/// @dev Isolated Gate 3 component; it does not mutate or call the deployed Router 2.0.
contract LQCIntentQuoteManager {
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant SOLVER_QUOTE_TYPEHASH = keccak256(
        "SolverQuote(bytes32 intentId,address solver,address tokenIn,address tokenOut,uint256 amountIn,uint256 grossAmountOut,uint256 gasCostInTokenOut,uint256 protocolFeeInTokenOut,uint256 netAmountOut,uint256 minimumAmountOut,bytes32 routeHash,uint64 validUntil,uint256 nonce)"
    );
    bytes32 public constant NAME_HASH = keccak256("LQC Intent Quote Manager");
    bytes32 public constant VERSION_HASH = keccak256("1");
    uint256 public constant MAX_QUOTES = 32;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct SolverQuote {
        bytes32 intentId;
        address solver;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 grossAmountOut;
        uint256 gasCostInTokenOut;
        uint256 protocolFeeInTokenOut;
        uint256 netAmountOut;
        uint256 minimumAmountOut;
        bytes32 routeHash;
        uint64 validUntil;
        uint256 nonce;
    }

    address public immutable solverRegistry;
    mapping(address => mapping(uint256 => bool)) public quoteNonceInvalidated;

    error ZeroAddress();
    error InvalidQuoteCount();
    error InvalidQuote();
    error InvalidSignature();
    error QuoteExpired();
    error QuoteNonceInvalidated();
    error SolverIneligible();

    event QuoteNonceInvalidated(address indexed solver, uint256 indexed nonce);

    constructor(address solverRegistry_) {
        if (solverRegistry_ == address(0)) revert ZeroAddress();
        solverRegistry = solverRegistry_;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function hashQuote(SolverQuote calldata quote) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SOLVER_QUOTE_TYPEHASH,
                quote.intentId,
                quote.solver,
                quote.tokenIn,
                quote.tokenOut,
                quote.amountIn,
                quote.grossAmountOut,
                quote.gasCostInTokenOut,
                quote.protocolFeeInTokenOut,
                quote.netAmountOut,
                quote.minimumAmountOut,
                quote.routeHash,
                quote.validUntil,
                quote.nonce
            )
        );
        return keccak256(abi.encodePacked(bytes2(0x1901), domainSeparator(), structHash));
    }

    function invalidateQuoteNonce(uint256 nonce) external {
        quoteNonceInvalidated[msg.sender][nonce] = true;
        emit QuoteNonceInvalidated(msg.sender, nonce);
    }

    function selectBestQuote(
        bytes32 intentId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 userMinimumAmountOut,
        uint256 requiredExposure,
        SolverQuote[] calldata quotes,
        bytes[] calldata signatures
    ) external view returns (uint256 selectedIndex, bytes32 quoteHash, uint256 riskAdjustedAmountOut) {
        uint256 quoteCount = quotes.length;
        if (quoteCount == 0 || quoteCount > MAX_QUOTES || signatures.length != quoteCount) {
            revert InvalidQuoteCount();
        }

        bool found;
        address selectedSolver = address(type(uint160).max);
        for (uint256 i; i < quoteCount; ++i) {
            SolverQuote calldata quote = quotes[i];
            bytes32 digest = _validateQuote(
                intentId,
                tokenIn,
                tokenOut,
                amountIn,
                userMinimumAmountOut,
                requiredExposure,
                quote,
                signatures[i]
            );
            uint256 penaltyBps =
                ILQCIntentSolverEligibility(solverRegistry).riskPenaltyBps(quote.solver);
            uint256 score = _applyPenalty(quote.netAmountOut, penaltyBps);

            if (
                !found || score > riskAdjustedAmountOut
                    || (score == riskAdjustedAmountOut && uint160(quote.solver) < uint160(selectedSolver))
            ) {
                found = true;
                selectedIndex = i;
                quoteHash = digest;
                riskAdjustedAmountOut = score;
                selectedSolver = quote.solver;
            }
        }
    }

    function _validateQuote(
        bytes32 intentId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 userMinimumAmountOut,
        uint256 requiredExposure,
        SolverQuote calldata quote,
        bytes calldata signature
    ) private view returns (bytes32 digest) {
        if (
            quote.intentId != intentId || quote.solver == address(0) || quote.tokenIn != tokenIn
                || quote.tokenOut != tokenOut || quote.amountIn != amountIn
                || quote.routeHash == bytes32(0) || quote.minimumAmountOut < userMinimumAmountOut
                || quote.netAmountOut < quote.minimumAmountOut
        ) revert InvalidQuote();
        if (
            quote.gasCostInTokenOut > quote.grossAmountOut
                || quote.protocolFeeInTokenOut > quote.grossAmountOut - quote.gasCostInTokenOut
                || quote.netAmountOut
                    != quote.grossAmountOut - quote.gasCostInTokenOut - quote.protocolFeeInTokenOut
        ) revert InvalidQuote();
        if (block.timestamp > quote.validUntil) revert QuoteExpired();
        if (quoteNonceInvalidated[quote.solver][quote.nonce]) revert QuoteNonceInvalidated();
        if (!ILQCIntentSolverEligibility(solverRegistry).canExecute(quote.solver, requiredExposure)) {
            revert SolverIneligible();
        }

        digest = hashQuote(quote);
        if (_recoverSigner(digest, signature) != quote.solver) revert InvalidSignature();
    }

    function _applyPenalty(uint256 amount, uint256 penaltyBps) private pure returns (uint256) {
        uint256 multiplier = 10_000 - penaltyBps;
        return (amount / 10_000) * multiplier + ((amount % 10_000) * multiplier) / 10_000;
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature)
        private
        pure
        returns (address signer)
    {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER || (v != 27 && v != 28)) {
            revert InvalidSignature();
        }
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
