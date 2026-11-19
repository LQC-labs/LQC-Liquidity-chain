// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ILQCVenueExecutionPortStageAR} from
    "./LocalFuturesV2Bsc97PortsStageAR.sol";

interface IERC20VenueStageAV {
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount)
        external returns (bool);
}

/**
 * @notice BSC97 research-only, exact balance-delta on-chain test-token fill.
 * @dev This executes a swap of TWO locally supplied ERC20s and exposes the
 *      resulting receipt through Stage AR's executionOf(). A pre-approved
 *      maker key must sign the full fill. Both assets must actually move with
 *      exact vault and account balance deltas before finality is recorded.
 *      This IS NOT proof of an external exchange trade, Pyth reference price,
 *      fair execution, independent liquidity, real token redemption, or
 *      protocol margin safety. Never use valuable tokens or deploy it.
 *      Quote tokens intentionally remain inside this prototype; withdrawal,
 *      fee distribution and governance are NOT implemented.
 */
contract LocalFuturesV2Bsc97ExactTokenVenueStageAV is
    ILQCVenueExecutionPortStageAR
{
    error WrongChain();
    error InvalidConfiguration();
    error InvalidFill();
    error ExpiredFill();
    error Forbidden();
    error AlreadyUsed();
    error UnfundedInventory();
    error FeeCapExceeded();
    error TokenCodeChanged();
    error TransferFailed();
    error BalanceMismatch();
    error InvalidSignature();
    error WrongMakerSigner();
    error Reentrant();

    struct Fill {
        bytes32 tradeId;
        bytes32 positionKey;
        address account;
        uint256 quoteSpent18;
        uint256 baseReceived18;
        uint256 feePaid18;
        uint256 minBaseReceived18;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("LQC Stage AV Test Token Venue");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant FILL_TYPEHASH = keccak256(
        "ExactFill(bytes32 tradeId,bytes32 positionKey,address account,uint256 quoteSpent18,uint256 baseReceived18,uint256 feePaid18,uint256 minBaseReceived18,uint256 nonce,uint256 deadline)"
    );
    uint256 private constant HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    IERC20VenueStageAV public immutable quoteToken;
    IERC20VenueStageAV public immutable baseToken;
    bytes32 public immutable approvedQuoteCodehash;
    bytes32 public immutable approvedBaseCodehash;
    address public immutable makerSigner;
    uint16 public immutable maxFeeBps;

    uint256 public baseInventory18;
    uint256 public retainedQuoteProceeds18;
    mapping(uint256 => bool) public usedNonce;
    mapping(bytes32 => bool) public usedTrade;
    mapping(bytes32 => bool) public usedPosition;
    mapping(bytes32 => ExecutionReceipt) private receipts;
    bool private entered;

    event BaseInventoryFunded(address indexed provider, uint256 exactBaseAmount18);
    event ExactFillFinalized(
        bytes32 indexed tradeId, bytes32 indexed positionKey,
        address indexed account, uint256 exactQuoteSpent18,
        uint256 exactBaseReceived18, bytes32 executionEvidence
    );

    modifier nonReentrant() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    constructor(address quote_, bytes32 quoteCodehash_,
        address base_, bytes32 baseCodehash_,
        address maker_, uint16 feeCapBps_)
    {
        if (block.chainid != 97) revert WrongChain();
        if (quote_ == address(0) || base_ == address(0) || quote_ == base_ ||
            quote_.code.length == 0 || base_.code.length == 0 ||
            quoteCodehash_ == bytes32(0) || baseCodehash_ == bytes32(0) ||
            quote_.codehash != quoteCodehash_ || base_.codehash != baseCodehash_ ||
            maker_ == address(0) || maker_.code.length != 0 ||
            feeCapBps_ == 0 || feeCapBps_ > 1000) revert InvalidConfiguration();
        try IERC20VenueStageAV(quote_).decimals() returns (uint8 d) {
            if (d != 18) revert InvalidConfiguration();
        } catch { revert InvalidConfiguration(); }
        try IERC20VenueStageAV(base_).decimals() returns (uint8 d) {
            if (d != 18) revert InvalidConfiguration();
        } catch { revert InvalidConfiguration(); }
        quoteToken = IERC20VenueStageAV(quote_);
        baseToken = IERC20VenueStageAV(base_);
        approvedQuoteCodehash = quoteCodehash_;
        approvedBaseCodehash = baseCodehash_;
        makerSigner = maker_;
        maxFeeBps = feeCapBps_;
    }

    /** @notice Real test-token inventory is deposited BEFORE any fill. */
    function fundBaseInventory(uint256 amount18) external nonReentrant {
        _requireChain();
        _checkRuntime();
        if (amount18 == 0) revert InvalidFill();
        _requireCoverage();
        uint256 vaultBefore = baseToken.balanceOf(address(this));
        uint256 payerBefore = baseToken.balanceOf(msg.sender);
        _safeTokenCall(address(baseToken), abi.encodeCall(
            IERC20VenueStageAV.transferFrom,
            (msg.sender, address(this), amount18)
        ));
        uint256 vaultAfter = baseToken.balanceOf(address(this));
        uint256 payerAfter = baseToken.balanceOf(msg.sender);
        if (vaultAfter < vaultBefore || vaultAfter - vaultBefore != amount18 ||
            payerAfter > payerBefore || payerBefore - payerAfter != amount18)
            revert BalanceMismatch();
        baseInventory18 += amount18;
        emit BaseInventoryFunded(msg.sender, amount18);
    }

    /** @notice Calculate an exact EIP-712 maker quote for offline signing. */
    function previewFill(Fill calldata f) external view returns (bytes32) {
        _requireChain();
        _validate(f);
        return _fillDigest(f);
    }

    /**
     * @notice Called by the actual ERC20-spending account, never a relayer.
     * @dev Reverts atomically on taxed/false/nonstandard token transfers,
     *      inventory deficits, bad maker quotes and any balance mismatch.
     */
    function executeSignedFill(Fill calldata f, bytes calldata makerSignature)
        external nonReentrant returns (bytes32 evidence)
    {
        _requireChain();
        _checkRuntime();
        _validate(f);
        if (msg.sender != f.account) revert Forbidden();
        if (usedNonce[f.nonce] || usedTrade[f.tradeId] ||
            usedPosition[f.positionKey]) revert AlreadyUsed();
        if (_recover(_fillDigest(f), makerSignature) != makerSigner)
            revert WrongMakerSigner();
        _requireCoverage();
        if (baseInventory18 < f.baseReceived18) revert UnfundedInventory();

        uint256 quoteBefore = quoteToken.balanceOf(address(this));
        uint256 payerQuoteBefore = quoteToken.balanceOf(f.account);
        uint256 baseBefore = baseToken.balanceOf(address(this));
        uint256 buyerBaseBefore = baseToken.balanceOf(f.account);

        // Effects first. Any token error rolls all flags and balances back.
        usedNonce[f.nonce] = true;
        usedTrade[f.tradeId] = true;
        usedPosition[f.positionKey] = true;
        baseInventory18 -= f.baseReceived18;
        retainedQuoteProceeds18 += f.quoteSpent18;

        _safeTokenCall(address(quoteToken), abi.encodeCall(
            IERC20VenueStageAV.transferFrom,
            (f.account, address(this), f.quoteSpent18)
        ));
        _safeTokenCall(address(baseToken), abi.encodeCall(
            IERC20VenueStageAV.transfer, (f.account, f.baseReceived18)
        ));

        uint256 quoteAfter = quoteToken.balanceOf(address(this));
        uint256 payerQuoteAfter = quoteToken.balanceOf(f.account);
        uint256 baseAfter = baseToken.balanceOf(address(this));
        uint256 buyerBaseAfter = baseToken.balanceOf(f.account);
        if (quoteAfter < quoteBefore || quoteAfter - quoteBefore != f.quoteSpent18 ||
            payerQuoteAfter > payerQuoteBefore ||
            payerQuoteBefore - payerQuoteAfter != f.quoteSpent18 ||
            baseAfter > baseBefore || baseBefore - baseAfter != f.baseReceived18 ||
            buyerBaseAfter < buyerBaseBefore ||
            buyerBaseAfter - buyerBaseBefore != f.baseReceived18 ||
            quoteAfter < retainedQuoteProceeds18 ||
            baseAfter < baseInventory18) revert BalanceMismatch();

        bytes32 permitDigest = _fillDigest(f);
        evidence = keccak256(abi.encode(
            "LQC_REC134_EXACT_TEST_TOKEN_EXECUTION_NOT_EXTERNAL",
            block.chainid, address(this), address(quoteToken), address(baseToken),
            approvedQuoteCodehash, approvedBaseCodehash,
            permitDigest, makerSigner, f.nonce, f.tradeId, f.positionKey,
            f.account, f.quoteSpent18, f.baseReceived18, f.feePaid18
        ));
        if (block.timestamp > type(uint64).max) revert InvalidFill();
        receipts[f.tradeId] = ExecutionReceipt({
            tradeId: f.tradeId, positionKey: f.positionKey,
            account: f.account, quoteToken: address(quoteToken),
            baseToken: address(baseToken), quoteSpent18: f.quoteSpent18,
            baseReceived18: f.baseReceived18, feePaid18: f.feePaid18,
            executionEvidence: evidence,
            executedAt: uint64(block.timestamp), finalized: true
        });
        emit ExactFillFinalized(
            f.tradeId, f.positionKey, f.account,
            f.quoteSpent18, f.baseReceived18, evidence
        );
    }

    /** @notice Returns only actual on-chain token-movement receipts. */
    function executionOf(bytes32 tradeId)
        external view returns (ExecutionReceipt memory)
    {
        _requireChain();
        _checkRuntime();
        _requireCoverage();
        return receipts[tradeId];
    }

    function coverage() external view returns (
        uint256 baseHeld18, uint256 baseReserved18,
        uint256 quoteHeld18, uint256 quoteReserved18, bool covered
    ) {
        _requireChain();
        _checkRuntime();
        baseHeld18 = baseToken.balanceOf(address(this));
        baseReserved18 = baseInventory18;
        quoteHeld18 = quoteToken.balanceOf(address(this));
        quoteReserved18 = retainedQuoteProceeds18;
        covered = baseHeld18 >= baseReserved18 &&
            quoteHeld18 >= quoteReserved18;
    }

    function _validate(Fill calldata f) private view {
        if (f.tradeId == bytes32(0) || f.positionKey == bytes32(0) ||
            f.account == address(0) || f.quoteSpent18 == 0 ||
            f.baseReceived18 == 0 || f.minBaseReceived18 == 0 ||
            f.nonce == 0 || f.baseReceived18 < f.minBaseReceived18)
            revert InvalidFill();
        if (f.deadline <= block.timestamp ||
            f.deadline > block.timestamp + 86400) revert ExpiredFill();
        if (f.feePaid18 > f.quoteSpent18 * maxFeeBps / 10000)
            revert FeeCapExceeded();
    }

    function _checkRuntime() private view {
        if (address(quoteToken).codehash != approvedQuoteCodehash ||
            address(baseToken).codehash != approvedBaseCodehash)
            revert TokenCodeChanged();
    }

    function _requireCoverage() private view {
        if (baseToken.balanceOf(address(this)) < baseInventory18 ||
            quoteToken.balanceOf(address(this)) < retainedQuoteProceeds18)
            revert BalanceMismatch();
    }

    function _requireChain() private view {
        if (block.chainid != 97) revert WrongChain();
    }

    function _fillDigest(Fill calldata f) private view returns (bytes32) {
        bytes32 message = keccak256(abi.encode(
            FILL_TYPEHASH, f.tradeId, f.positionKey, f.account,
            f.quoteSpent18, f.baseReceived18, f.feePaid18,
            f.minBaseReceived18, f.nonce, f.deadline
        ));
        bytes32 domain = keccak256(abi.encode(
            DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)
        ));
        return keccak256(abi.encodePacked("\x19\x01", domain, message));
    }

    function _recover(bytes32 digest, bytes calldata signature)
        private pure returns (address signer)
    {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if ((v != 27 && v != 28) || uint256(r) == 0 ||
            uint256(s) == 0 || uint256(s) > HALF_ORDER)
            revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    function _safeTokenCall(address token, bytes memory data) private {
        (bool ok, bytes memory result) = token.call(data);
        if (!ok || (result.length != 0 &&
            (result.length != 32 || !abi.decode(result, (bool)))))
            revert TransferFailed();
    }
}
