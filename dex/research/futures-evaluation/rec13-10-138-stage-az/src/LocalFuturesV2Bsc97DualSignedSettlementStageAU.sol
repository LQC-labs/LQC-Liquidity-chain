// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    ILQCVenueExecutionPortStageAR as VenuePort,
    ILQCCollateralCustodyPortStageAR as CustodyPort
} from "./LocalFuturesV2Bsc97PortsStageAR.sol";

interface IExactVaultStageAU is CustodyPort {
    function controller() external view returns (address);
    function collateralToken() external view returns (address);
    function registerPosition(bytes32 positionKey, address owner) external;
    function settle(bytes32 positionKey, uint256 payout18, bytes32 evidence) external;
}

/**
 * @notice BSC97 research-only controller for Stage AT test-token custody.
 * @dev Stage AU is deployed first, then Stage AT with `controller = Stage AU`.
 *      Its one-time deployer binds that vault before any deposit or settlement.
 *      Two independently configured EOA keys must sign the exact EIP-712
 *      settlement details and an already-finalized on-chain venue receipt.
 *      IMPORTANT: This contract cannot prove that a venue adapter is honest.
 *      A malicious adapter and two colluding issuers can still fabricate
 *      execution. It does not validate Pyth, real margin, or trade economics.
 *      Never bind a live asset vault or use this as production authority.
 */
contract LocalFuturesV2Bsc97DualSignedSettlementStageAU {
    error WrongChain();
    error InvalidConfiguration();
    error Forbidden();
    error AlreadyBound();
    error UnboundVault();
    error PortCodeChanged();
    error VaultCodeChanged();
    error InvalidClaim();
    error ClaimExpired();
    error AlreadyUsed();
    error VenueReceiptMismatch();
    error VenueReceiptExpired();
    error FeeCapExceeded();
    error CustodyMismatch();
    error InvalidSignature();
    error WrongVenueSigner();
    error WrongCustodySigner();
    error Reentrant();

    struct Claim {
        bytes32 tradeId;
        bytes32 positionKey;
        bytes32 executionDigest;
        address owner;
        uint256 principal18;
        uint256 payout18;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("LQC Futures Stage AU Settlement");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "Settlement(bytes32 role,bytes32 tradeId,bytes32 positionKey,bytes32 executionDigest,address owner,uint256 principal18,uint256 payout18,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant VENUE_ROLE = keccak256("REC133_EXECUTION_ISSUER");
    bytes32 public constant CUSTODY_ROLE = keccak256("REC133_CUSTODY_ISSUER");
    uint256 private constant HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable binder;
    VenuePort public immutable venuePort;
    bytes32 public immutable approvedVenueCodehash;
    address public immutable venueSigner;
    address public immutable custodySigner;
    uint16 public immutable maxFeeBps;
    uint64 public immutable maxAgeSeconds;

    IExactVaultStageAU public vault;
    bytes32 public approvedVaultCodehash;
    mapping(uint256 => bool) public usedNonce;
    mapping(bytes32 => bool) public usedTrade;
    mapping(bytes32 => bool) public usedPosition;
    bool private entered;

    event VaultBound(address indexed vault, bytes32 runtimeCodehash);
    event PositionRegistered(bytes32 indexed positionKey, address indexed owner);
    event ApprovedSettlement(
        bytes32 indexed tradeId, bytes32 indexed positionKey,
        uint256 indexed nonce, uint256 paid18, bytes32 evidence
    );

    modifier nonReentrant() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address venue_, bytes32 venueHash_, address venueSigner_,
        address custodySigner_, uint16 feeCapBps_, uint64 maxAge_
    ) {
        if (block.chainid != 97) revert WrongChain();
        if (venue_ == address(0) || venue_.code.length == 0 ||
            venueHash_ == bytes32(0) || venue_.codehash != venueHash_ ||
            venueSigner_ == address(0) || custodySigner_ == address(0) ||
            venueSigner_ == custodySigner_ ||
            venueSigner_.code.length != 0 || custodySigner_.code.length != 0 ||
            feeCapBps_ == 0 || feeCapBps_ > 1000 ||
            maxAge_ == 0 || maxAge_ > 86400)
            revert InvalidConfiguration();
        binder = msg.sender;
        venuePort = VenuePort(venue_);
        approvedVenueCodehash = venueHash_;
        venueSigner = venueSigner_;
        custodySigner = custodySigner_;
        maxFeeBps = feeCapBps_;
        maxAgeSeconds = maxAge_;
    }

    /** @notice One-way bootstrap; only a separately chosen local deployer. */
    function bindVault(address vault_, bytes32 expectedRuntimeHash) external {
        _requireChain();
        if (msg.sender != binder) revert Forbidden();
        if (address(vault) != address(0)) revert AlreadyBound();
        if (vault_ == address(0) || vault_.code.length == 0 ||
            expectedRuntimeHash == bytes32(0) ||
            vault_.codehash != expectedRuntimeHash ||
            IExactVaultStageAU(vault_).controller() != address(this) ||
            IExactVaultStageAU(vault_).collateralToken() == address(0))
            revert InvalidConfiguration();
        vault = IExactVaultStageAU(vault_);
        approvedVaultCodehash = expectedRuntimeHash;
        emit VaultBound(vault_, expectedRuntimeHash);
    }

    /** @notice Owners must register their own key; no third-party registration. */
    function registerOwnPosition(bytes32 positionKey) external nonReentrant {
        _requireChain();
        _checkVault();
        if (positionKey == bytes32(0)) revert InvalidClaim();
        vault.registerPosition(positionKey, msg.sender);
        emit PositionRegistered(positionKey, msg.sender);
    }

    /** @notice Preview exact source-bound digests; cannot reserve a nonce. */
    function preview(Claim calldata claim)
        external view returns (bytes32 venueDigest, bytes32 custodyDigest)
    {
        _requireChain();
        _validate(claim);
        venueDigest = _digest(claim, VENUE_ROLE);
        custodyDigest = _digest(claim, CUSTODY_ROLE);
    }

    /**
     * @notice Verifies finalized source receipt, exact custody account and
     *         independent role signatures BEFORE calling Stage AT settlement.
     * @dev Used flags and ERC20 transfer are atomic; a vault error rolls
     *      the entire operation back, including nonce/trade/position flags.
     */
    function settleWithApprovals(
        Claim calldata claim,
        bytes calldata venueSignature,
        bytes calldata custodySignature
    ) external nonReentrant returns (bytes32 settlementEvidence) {
        _requireChain();
        if (usedNonce[claim.nonce] || usedTrade[claim.tradeId] ||
            usedPosition[claim.positionKey]) revert AlreadyUsed();
        _validate(claim);
        if (_recover(_digest(claim, VENUE_ROLE), venueSignature) != venueSigner)
            revert WrongVenueSigner();
        if (_recover(_digest(claim, CUSTODY_ROLE), custodySignature) != custodySigner)
            revert WrongCustodySigner();

        settlementEvidence = keccak256(abi.encode(
            "LQC_REC133_SIGNED_SETTLEMENT_RESEARCH_ONLY",
            block.chainid, address(this), address(venuePort), address(vault),
            approvedVenueCodehash, approvedVaultCodehash,
            claim.tradeId, claim.positionKey, claim.executionDigest,
            claim.owner, claim.principal18, claim.payout18,
            claim.nonce, claim.deadline, venueSigner, custodySigner
        ));
        usedNonce[claim.nonce] = true;
        usedTrade[claim.tradeId] = true;
        usedPosition[claim.positionKey] = true;
        vault.settle(claim.positionKey, claim.payout18, settlementEvidence);
        emit ApprovedSettlement(
            claim.tradeId, claim.positionKey, claim.nonce,
            claim.payout18, settlementEvidence
        );
    }

    function _validate(Claim calldata claim) private view {
        _checkVault();
        if (claim.tradeId == bytes32(0) || claim.positionKey == bytes32(0) ||
            claim.executionDigest == bytes32(0) || claim.owner == address(0) ||
            claim.principal18 == 0 || claim.nonce == 0)
            revert InvalidClaim();
        if (claim.deadline <= block.timestamp ||
            claim.deadline > block.timestamp + 86400) revert ClaimExpired();

        if (address(venuePort).codehash != approvedVenueCodehash)
            revert PortCodeChanged();
        VenuePort.ExecutionReceipt memory e = venuePort.executionOf(claim.tradeId);
        if (!e.finalized || e.tradeId != claim.tradeId ||
            e.positionKey != claim.positionKey || e.account != claim.owner ||
            e.quoteToken != vault.collateralToken() ||
            e.baseToken == address(0) || e.baseToken == e.quoteToken ||
            e.quoteSpent18 == 0 || e.baseReceived18 == 0 ||
            e.executionEvidence == bytes32(0) ||
            keccak256(abi.encode(e)) != claim.executionDigest)
            revert VenueReceiptMismatch();
        if (e.executedAt == 0 || uint256(e.executedAt) > block.timestamp ||
            block.timestamp - uint256(e.executedAt) > maxAgeSeconds)
            revert VenueReceiptExpired();
        if (e.feePaid18 > e.quoteSpent18 * maxFeeBps / 10000)
            revert FeeCapExceeded();

        CustodyPort.CustodyReceipt memory c = vault.custodyOf(claim.positionKey);
        if (c.finalized || c.positionKey != claim.positionKey ||
            c.account != claim.owner || c.principalLocked18 != claim.principal18 ||
            c.collateralToken != e.quoteToken ||
            c.custodyEvidence != bytes32(0) || c.payout18 != 0)
            revert CustodyMismatch();
    }

    function _checkVault() private view {
        if (address(vault) == address(0)) revert UnboundVault();
        if (address(vault).codehash != approvedVaultCodehash)
            revert VaultCodeChanged();
    }

    function _requireChain() private view {
        if (block.chainid != 97) revert WrongChain();
    }

    function _digest(Claim calldata claim, bytes32 role) private view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(
            CLAIM_TYPEHASH, role, claim.tradeId, claim.positionKey,
            claim.executionDigest, claim.owner, claim.principal18,
            claim.payout18, claim.nonce, claim.deadline
        ));
        bytes32 domain = keccak256(abi.encode(
            DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)
        ));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure
        returns (address signer)
    {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }
        if ((v != 27 && v != 28) || uint256(r) == 0 ||
            uint256(s) == 0 || uint256(s) > HALF_ORDER)
            revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
