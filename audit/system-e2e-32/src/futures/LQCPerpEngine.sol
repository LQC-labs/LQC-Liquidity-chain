// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCFuturesMarketRegistry} from "./LQCFuturesMarketRegistry.sol";
import {LQCFuturesVault} from "./LQCFuturesVault.sol";
import {LQCFuturesFundingMath} from "./LQCFuturesFundingMath.sol";
import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";

interface ILQCFuturesContractSigner {
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4);
}

interface ILQCSessionExecutionOracle {
    function requiresSessionProof() external view returns (bool);
    function verifyExecutionPrice(uint256 marketId, address indexToken, bytes calldata signedUpdate)
        external payable returns (uint256 price, uint256 updatedAt);
}

/// @notice Isolated-margin perpetual engine for LQC Flow Futures.
/// @dev Master 7/5 substeps 1-5 add canonical reduction, conserved funding, segregated fees,
///      bounded Futures-only Insurance/residual-bad-debt accounting and bounded partial liquidation.
///      7/5-6 begins with an explicit bounded ADL safety boundary; execution is added only after this gate.
contract LQCPerpEngine {
    uint256 public constant BPS = 10_000;
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant FUNDING_RAY = 1e27;
    uint256 public constant MAX_FUNDING_DELTA_RAY = FUNDING_RAY;
    uint256 public constant MAX_ORACLE_DELAY = 120 seconds;

    struct Position {
        uint256 margin;
        uint256 sizeUsd;
        uint256 entryPrice;
        bool isLong;
        bool open;
    }

    enum PositionAction { OPEN, REDUCE, CLOSE, ADD_MARGIN, REMOVE_MARGIN, INCREASE }

    struct AuthorizedPositionAction {
        address user;
        uint256 marketId;
        PositionAction action;
        uint256 sizeUsd;
        uint256 margin;
        bool isLong;
        uint256 priceLimit;
        uint256 positionId;
        uint256 deadline;
        uint256 nonce;
    }

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ACTION_TYPEHASH = keccak256(
        "AuthorizedPositionAction(address user,uint256 marketId,uint8 action,uint256 sizeUsd,uint256 margin,bool isLong,uint256 priceLimit,uint256 positionId,uint256 deadline,uint256 nonce)"
    );
    bytes32 private constant NAME_HASH = keccak256("LQCPerpEngine");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant ECDSA_MAX_S = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct FundingState {
        int256 cumulativeFundingPerUsdRay;
        uint256 maxAbsDeltaPerUpdateRay;
        bool configured;
    }

    struct FundingLedger {
        // Integer accrual already recognized, including explicit liquidation bad debt.
        // This is not a cash-paid counter. Reset only after archiving a full exit.
        int256 recognizedNetUnits;
        int256 activeRemainderRay;
        uint256 closedCreditRay;
        uint256 closedDebtRay;
    }

    LQCFuturesMarketRegistry public immutable registry;
    LQCFuturesVault public immutable vault;

    mapping(address => mapping(uint256 => Position)) public positions;
    mapping(uint256 => FundingState) public fundingStates;
    mapping(address => mapping(uint256 => int256)) public positionFundingEntryRay;
    mapping(uint256 => uint256) public tradingFeeBps;
    mapping(uint256 => uint256) public insuranceFeeShareBps;
    mapping(uint256 => uint256) public maxInsuranceCoverageBps;
    mapping(uint256 => uint256) public liquidationReductionBps;
    mapping(uint256 => uint256) public liquidationMinRemainingSizeUsd;
    mapping(uint256 => uint256) public maxAdlReductionBps;
    mapping(uint256 => bool) public adlEnabled;
    mapping(uint256 => uint256) public maxPositionNotionalUsd;
    mapping(uint256 => uint256) public maxOrderNotionalUsd;
    mapping(uint256 => uint256) public maxOpenInterestUsd;
    mapping(uint256 => uint256) public openInterestUsd;
    mapping(address => mapping(uint256 => FundingLedger)) public fundingLedgers;

    mapping(address => uint256) public actionNonces;
    // Preserve the generation after close or liquidation. Legacy positions start at generation zero.
    mapping(address => mapping(uint256 => uint256)) public positionIds;

    bool private sessionExecuting;

    event ActionNonceInvalidated(address indexed user, uint256 newNonce);

    event FundingCheckpointRecorded(address indexed account, uint256 indexed marketId, int256 recognizedDelta, int256 fundedPayment, uint256 unpaid, int256 recognizedNetUnits, int256 remainderRay);
    event ClosedFundingRecorded(address indexed account, uint256 indexed marketId, address indexed collateralToken, int256 recognizedNetUnits, int256 remainderRay);

    event PositionOpened(
        address indexed account,
        uint256 indexed marketId,
        bool isLong,
        uint256 margin,
        uint256 sizeUsd,
        uint256 entryPrice
    );
    event PositionReduced(
        address indexed account,
        uint256 indexed marketId,
        uint256 reducedSizeUsd,
        uint256 releasedMargin,
        uint256 remainingSizeUsd,
        uint256 remainingMargin,
        uint256 exitPrice,
        int256 realizedPnl
    );
    event PositionClosed(address indexed account, uint256 indexed marketId, uint256 exitPrice, int256 pnl);
    event PositionLiquidated(
        address indexed account,
        uint256 indexed marketId,
        address indexed liquidator,
        uint256 price,
        int256 pnl
    );
    event FundingConfigured(uint256 indexed marketId, uint256 maxAbsDeltaPerUpdateRay);
    event TradingFeeConfigured(uint256 indexed marketId, uint256 feeBps, uint256 insuranceShareBps);
    event TradingFeeCharged(address indexed account, uint256 indexed marketId, uint256 notionalUsd, uint256 fee, uint256 insuranceAmount);
    event InsuranceCoverageConfigured(uint256 indexed marketId, uint256 maxCoverageBps);
    event AdlSafetyConfigured(uint256 indexed marketId, bool enabled, uint256 maxReductionBps);
    event MarketNotionalLimitsConfigured(uint256 indexed marketId, uint256 maxPositionNotionalUsd, uint256 maxOrderNotionalUsd);
    event MarketOpenInterestLimitConfigured(uint256 indexed marketId, uint256 maxOpenInterestUsd);
    event PartialLiquidationConfigured(
        uint256 indexed marketId,
        uint256 reductionBps,
        uint256 minRemainingSizeUsd
    );
    event AdlExecuted(address indexed account, uint256 indexed marketId, uint256 reducedSizeUsd, uint256 absorbedBadDebt, uint256 remainingSizeUsd, uint256 price);
    event PositionPartiallyLiquidated(
        address indexed account,
        uint256 indexed marketId,
        address indexed liquidator,
        uint256 reducedSizeUsd,
        uint256 remainingSizeUsd,
        uint256 remainingMargin,
        uint256 price,
        int256 realizedPnl
    );
    event LiquidationFundingApplied(
        address indexed account,
        uint256 indexed marketId,
        int256 payment,
        uint256 marginCredit,
        uint256 marginDebit,
        uint256 insuranceCovered,
        uint256 residualBadDebt
    );
    event PositionDeficitRecorded(
        address indexed account,
        uint256 indexed marketId,
        uint256 deficit,
        uint256 insuranceCovered,
        uint256 residualBadDebt
    );
    event FundingIndexUpdated(
        uint256 indexed marketId,
        int256 previousIndexRay,
        int256 newIndexRay,
        int256 deltaRay
    );
    event FundingSettled(
        address indexed account,
        uint256 indexed marketId,
        int256 payment,
        int256 checkpointIndexRay
    );

    error InvalidActionSignature();
    error InvalidActionNonce();
    error ActionExpired();
    error PositionIdentityMismatch();
    error ActionPriceLimitExceeded();
    error WrapperExecutionUnavailable();

    error Forbidden();
    error InvalidAmount();
    error InvalidReduction();
    error MarketInactive();
    error PositionExists();
    error PositionNotFound();
    error LeverageTooHigh();
    error InvalidOraclePrice();
    error UnapprovedRecoveryOracle();
    error StaleOraclePrice();
    error NotLiquidatable();
    error PartialReductionWouldCreateBadDebt();
    error FundingMarketNotFound();
    error FundingNotConfigured();
    error InvalidFundingBound();
    error InvalidFundingDelta();
    error FundingDeltaTooLarge();
    error FundingOverflow();
    error ClosedFundingSettlementBlocked();
    error FundingClosureBlocked();
    error InvalidFeeConfiguration();
    error InvalidInsuranceConfiguration();
    error InvalidLiquidationConfiguration();
    error InvalidAdlConfiguration();
    error AdlNotEnabled();
    error AdlBadDebtRequired();
    error AdlPositionNotProfitable();
    error AdlReductionTooLarge();
    error InvalidNotionalLimits();
    error MaxOrderNotionalExceeded();
    error MaxPositionNotionalExceeded();
    error MaxOpenInterestExceeded();

    modifier onlyRegistryOwner() {
        _checkRegistryOwner();
        _;
    }

    function _checkRegistryOwner() private view {
        if (msg.sender != registry.owner()) revert Forbidden();
    }


    // The Engine binds its own stateless calculator at construction. Quotes use STATICCALL.
    LQCFuturesFundingMath private immutable fundingMath;

    constructor(address registry_, address vault_) {
        if (registry_ == address(0) || vault_ == address(0)) revert InvalidAmount();
        registry = LQCFuturesMarketRegistry(registry_);
        vault = LQCFuturesVault(vault_);
        fundingMath = new LQCFuturesFundingMath();
    }

    function _requireConfiguredMarket(uint256 marketId) private view {
        if (marketId == 0 || marketId > registry.marketCount()) revert FundingMarketNotFound();
    }

    function configureMarketOpenInterestLimit(uint256 marketId, uint256 maxOpenInterest) external onlyRegistryOwner {
        if (marketId == 0 || marketId > registry.marketCount() || maxOpenInterest == 0) revert InvalidNotionalLimits();
        if (maxOpenInterest < openInterestUsd[marketId]) revert InvalidNotionalLimits();
        maxOpenInterestUsd[marketId] = maxOpenInterest;
        emit MarketOpenInterestLimitConfigured(marketId, maxOpenInterest);
    }

    function configureMarketNotionalLimits(uint256 marketId, uint256 maxPositionUsd, uint256 maxOrderUsd) external onlyRegistryOwner {
        _requireConfiguredMarket(marketId);
        if (maxPositionUsd == 0 || maxOrderUsd == 0 || maxOrderUsd > maxPositionUsd) revert InvalidNotionalLimits();
        maxPositionNotionalUsd[marketId] = maxPositionUsd;
        maxOrderNotionalUsd[marketId] = maxOrderUsd;
        emit MarketNotionalLimitsConfigured(marketId, maxPositionUsd, maxOrderUsd);
    }

    /// @notice Configures the per-market Futures trading fee and its Insurance reserve share.
    /// @dev BPS values are bounded; Treasury receives the remainder. Reserve spending is deferred to later gates.
    function configureTradingFee(uint256 marketId, uint256 feeBps, uint256 insuranceShareBps_) external onlyRegistryOwner {
        _requireConfiguredMarket(marketId);
        if (feeBps > BPS || insuranceShareBps_ > BPS) revert InvalidFeeConfiguration();
        tradingFeeBps[marketId] = feeBps;
        insuranceFeeShareBps[marketId] = insuranceShareBps_;
        emit TradingFeeConfigured(marketId, feeBps, insuranceShareBps_);
    }

    /// @notice Configures the emergency ADL safety boundary only; this does not execute ADL.
    /// @dev ADL must be explicitly enabled by Governance and is capped per execution.
    ///      A nonzero residual Futures bad-debt condition is required by the execution gate added next.
    function configureAdlSafety(uint256 marketId, bool enabled, uint256 maxReductionBps) external onlyRegistryOwner {
        _requireConfiguredMarket(marketId);
        if (enabled && (maxReductionBps == 0 || maxReductionBps > BPS)) revert InvalidAdlConfiguration();
        if (!enabled && maxReductionBps != 0) revert InvalidAdlConfiguration();
        adlEnabled[marketId] = enabled;
        maxAdlReductionBps[marketId] = maxReductionBps;
        emit AdlSafetyConfigured(marketId, enabled, maxReductionBps);
    }

    /// @notice Returns true only when Governance enabled ADL and unresolved Futures bad debt exists.
    function isAdlEmergencyActive(uint256 marketId, address collateralToken) public view returns (bool) {
        if (marketId == 0 || marketId > registry.marketCount()) return false;
        return adlEnabled[marketId] && maxAdlReductionBps[marketId] != 0 && vault.residualBadDebt(collateralToken) != 0;
    }

    /// @notice Executes a Governance-only, bounded ADL reduction against explicit residual Futures bad debt.
    /// @dev This primitive cannot create new debt: only profitable position slices may absorb existing residual debt.
    function executeAdl(address account, uint256 marketId, uint256 reduceSizeUsd) external onlyRegistryOwner {
        this.settleAdl(account, marketId, reduceSizeUsd, 0);
    }

    function settleAdl(address account, uint256 marketId, uint256 reduceSizeUsd, uint256 verifiedPrice) external onlyEngine {
        if (!adlEnabled[marketId]) revert AdlNotEnabled();
        Position storage stored = positions[account][marketId];
        if (!stored.open) revert PositionNotFound();
        if (reduceSizeUsd == 0 || reduceSizeUsd > stored.sizeUsd) revert InvalidReduction();

        (address indexToken, address collateralToken, address oracle,,,) = _riskContext(marketId);
        uint256 debt = vault.residualBadDebt(collateralToken);
        if (debt == 0) revert AdlBadDebtRequired();

        uint256 cap = stored.sizeUsd * maxAdlReductionBps[marketId] / BPS;
        if (cap == 0 || reduceSizeUsd > cap) revert AdlReductionTooLarge();

        uint256 price = _price(marketId, indexToken, oracle, verifiedPrice);
        int256 slicePnl = _pnl(reduceSizeUsd, stored.entryPrice, stored.isLong, price);
        if (slicePnl <= 0) revert AdlPositionNotProfitable();

        uint256 profit = uint256(slicePnl);
        uint256 absorbed = profit < debt ? profit : debt;
        uint256 releasedMargin = stored.margin * reduceSizeUsd / stored.sizeUsd;
        if (releasedMargin == 0) revert InvalidReduction();

        _settleFundingCheckpoint(account, marketId, collateralToken, stored);
        stored.sizeUsd -= reduceSizeUsd;
        openInterestUsd[marketId] -= reduceSizeUsd;
        stored.margin -= releasedMargin;
        vault.unlockCollateral(account, collateralToken, releasedMargin);
        vault.absorbAdlBadDebt(collateralToken, absorbed);

        if (stored.sizeUsd == 0) {
            _archiveFunding(account, marketId, collateralToken);
            _eraseClosedPosition(account, marketId);
        }
        emit AdlExecuted(account, marketId, reduceSizeUsd, absorbed, stored.sizeUsd, price);
    }

    /// @notice Configures the bounded partial-liquidation step for a market.
    /// @dev A zero stored reduction means legacy full liquidation. Governance may configure
    ///      1..10000 bps. minRemainingSizeUsd may be zero to disable dust promotion.
    function configurePartialLiquidation(
        uint256 marketId,
        uint256 reductionBps,
        uint256 minRemainingSizeUsd
    ) external onlyRegistryOwner {
        _requireConfiguredMarket(marketId);
        if (reductionBps == 0 || reductionBps > BPS) revert InvalidLiquidationConfiguration();

        liquidationReductionBps[marketId] = reductionBps;
        liquidationMinRemainingSizeUsd[marketId] = minRemainingSizeUsd;
        emit PartialLiquidationConfigured(marketId, reductionBps, minRemainingSizeUsd);
    }

    /// @notice Configures the maximum fraction of a realized deficit that Insurance may cover.
    /// @dev This is a Governance-supplied bound, not a hard-coded product value.
    ///      Available Insurance reserve remains the global physical coverage ceiling.
    function configureInsuranceCoverage(uint256 marketId, uint256 maxCoverageBps) external onlyRegistryOwner {
        _requireConfiguredMarket(marketId);
        if (maxCoverageBps > BPS) revert InvalidInsuranceConfiguration();
        maxInsuranceCoverageBps[marketId] = maxCoverageBps;
        emit InsuranceCoverageConfigured(marketId, maxCoverageBps);
    }

    /// @notice Sets the per-market maximum absolute funding-index change accepted per update.
    /// @dev No product funding rate is hard-coded here. Governance supplies a market-specific bound.
    ///      FUNDING_RAY is only a protocol safety ceiling of 100% per update, not an approved economic rate.
    function configureFunding(uint256 marketId, uint256 maxAbsDeltaPerUpdateRay) external onlyRegistryOwner {
        _requireConfiguredMarket(marketId);
        if (maxAbsDeltaPerUpdateRay == 0 || maxAbsDeltaPerUpdateRay > MAX_FUNDING_DELTA_RAY) {
            revert InvalidFundingBound();
        }

        FundingState storage state = fundingStates[marketId];
        state.maxAbsDeltaPerUpdateRay = maxAbsDeltaPerUpdateRay;
        state.configured = true;
        emit FundingConfigured(marketId, maxAbsDeltaPerUpdateRay);
    }

    /// @notice Advances the cumulative funding index after a fresh market-oracle check.
    /// @dev Positive delta means longs pay shorts; negative delta means shorts pay longs.
    function updateFundingIndex(uint256 marketId, int256 deltaRay) external onlyRegistryOwner {
        this.applyFundingIndex(marketId, deltaRay, 0);
    }

    function applyFundingIndex(uint256 marketId, int256 deltaRay, uint256 verifiedPrice) external onlyEngine {
        FundingState storage state = fundingStates[marketId];
        if (!state.configured) revert FundingNotConfigured();
        if (deltaRay == 0 || deltaRay == type(int256).min) revert InvalidFundingDelta();

        uint256 absDelta = uint256(deltaRay < 0 ? -deltaRay : deltaRay);
        if (absDelta > state.maxAbsDeltaPerUpdateRay) revert FundingDeltaTooLarge();

        if (registry.marketMode(marketId) != LQCFuturesMarketRegistry.MarketMode.ACTIVE) revert MarketInactive();
        _marketPrice(marketId, verifiedPrice);

        int256 previous = state.cumulativeFundingPerUsdRay;
        int256 next = previous + deltaRay;
        state.cumulativeFundingPerUsdRay = next;
        emit FundingIndexUpdated(marketId, previous, next, deltaRay);
    }

    modifier onlyEngine() {
        if (msg.sender != address(this)) revert InvalidActionSignature();
        _;
    }

    modifier sessionExecution() {
        _beginSessionExecution();
        _;
        sessionExecuting = false;
    }

    function _beginSessionExecution() private {
        if (sessionExecuting) revert WrapperExecutionUnavailable();
        sessionExecuting = true;
    }

    function executeAuthorizedPositionActionWithProof(
        AuthorizedPositionAction calldata request, bytes calldata signature, bytes calldata signedUpdate
    ) external payable sessionExecution {
        _authorizePositionAction(request, signature);
        uint256 price = _verifySessionPrice(request.marketId, signedUpdate);
        this.dispatchAuthorizedPositionAction(request, price);
    }

    function liquidateWithProof(address account, uint256 marketId, bytes calldata signedUpdate)
        external payable sessionExecution
    {
        this.settleLiquidation(msg.sender, account, marketId, _verifySessionPrice(marketId, signedUpdate));
    }

    function executeAdlWithProof(address account, uint256 marketId, uint256 reduceSizeUsd, bytes calldata signedUpdate)
        external payable onlyRegistryOwner sessionExecution
    {
        this.settleAdl(account, marketId, reduceSizeUsd, _verifySessionPrice(marketId, signedUpdate));
    }

    function updateFundingIndexWithProof(uint256 marketId, int256 deltaRay, bytes calldata signedUpdate)
        external payable onlyRegistryOwner sessionExecution
    {
        this.applyFundingIndex(marketId, deltaRay, _verifySessionPrice(marketId, signedUpdate));
    }

    function invalidateActionNonce(uint256 newNonce) external {
        if (newNonce <= actionNonces[msg.sender]) revert InvalidActionNonce();
        actionNonces[msg.sender] = newNonce;
        emit ActionNonceInvalidated(msg.sender, newNonce);
    }

    function executeAuthorizedPositionAction(AuthorizedPositionAction calldata request, bytes calldata signature) external {
        _authorizePositionAction(request, signature);
        this.dispatchAuthorizedPositionAction(request, 0);
    }

    function _authorizePositionAction(AuthorizedPositionAction calldata request, bytes calldata signature) private {
        address user = request.user;
        uint256 marketId = request.marketId;
        if (request.deadline < block.timestamp) revert ActionExpired();
        if (user == address(0) || request.sizeUsd == 0 || request.priceLimit == 0) revert InvalidAmount();
        if (request.nonce != actionNonces[user]) revert InvalidActionNonce();
        if (request.positionId != positionIds[user][marketId]) revert PositionIdentityMismatch();
        if (!_validActionSignature(user, _actionDigest(request), signature)) revert InvalidActionSignature();

        actionNonces[user] = request.nonce + 1;
    }

    function dispatchAuthorizedPositionAction(AuthorizedPositionAction calldata request, uint256 verifiedPrice) external {
        if (msg.sender != address(this)) revert InvalidActionSignature();
        address user = request.user;
        uint256 marketId = request.marketId;
        if (request.action == PositionAction.OPEN || request.action == PositionAction.INCREASE) {
            _openPosition(user, marketId, request.margin, request.sizeUsd, request.isLong, request.priceLimit, verifiedPrice, request.action == PositionAction.INCREASE);
        } else {
            if (request.isLong) revert InvalidAmount();
            if (request.action == PositionAction.REDUCE || request.action == PositionAction.CLOSE) {
                if (request.margin != 0) revert InvalidAmount();
                if (request.action == PositionAction.REDUCE) {
                    _reducePosition(user, marketId, request.sizeUsd, request.priceLimit, verifiedPrice);
                } else {
                    _closePosition(user, marketId, request.sizeUsd, request.priceLimit, verifiedPrice);
                }
            } else {
                _adjustMargin(request, verifiedPrice);
            }
        }
    }

    event PositionMarginAdjusted(address indexed account, uint256 indexed marketId, uint256 margin);

    function _adjustMargin(AuthorizedPositionAction calldata request, uint256 verifiedPrice) private {
        address account = request.user;
        uint256 market = request.marketId;
        Position storage position = positions[account][market];
        if (!position.open) revert PositionNotFound();
        if (position.sizeUsd != request.sizeUsd) revert PositionIdentityMismatch();
        uint256 amount = request.margin;
        if (amount == 0) revert InvalidAmount();
        (address index, address token, address oracle, uint32 leverage, uint32 maintenance,) = _riskContext(market);
        uint256 price = _price(market, index, oracle, verifiedPrice);
        _checkActionPrice(price, request.priceLimit, !position.isLong);
        _settleFundingCheckpoint(account, market, token, position);
        if (request.action == PositionAction.ADD_MARGIN) {
            vault.lockCollateral(account, token, amount);
            position.margin += amount;
        } else {
            if (registry.marketMode(market) != LQCFuturesMarketRegistry.MarketMode.ACTIVE) revert MarketInactive();
            if (amount >= position.margin) revert InvalidAmount();
            uint256 remainingMargin = position.margin - amount;
            uint256 eligibleMargin = remainingMargin;
            int256 pnl = _pnl(position.sizeUsd, position.entryPrice, position.isLong, price);
            if (pnl < 0) {
                eligibleMargin = _afterLoss(eligibleMargin, pnl);
            }
            if (position.sizeUsd * BPS > eligibleMargin * leverage ||
                eligibleMargin <= position.sizeUsd * maintenance / BPS) revert LeverageTooHigh();
            position.margin = remainingMargin;
            vault.unlockCollateral(account, token, amount);
        }
        emit PositionMarginAdjusted(account, market, position.margin);
    }

    function _afterLoss(uint256 margin, int256 pnl) private pure returns (uint256) {
        uint256 loss = uint256(-pnl);
        return loss < margin ? margin - loss : 0;
    }

    function _actionDigest(AuthorizedPositionAction calldata request) private view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
        return keccak256(abi.encodePacked(hex"1901", domain, keccak256(abi.encode(ACTION_TYPEHASH, request))));
    }

    function _validActionSignature(address user, bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (user.code.length != 0) {
            try ILQCFuturesContractSigner(user).isValidSignature(digest, signature) returns (bytes4 result) {
                return result == ILQCFuturesContractSigner.isValidSignature.selector;
            } catch {
                return false;
            }
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        return uint256(s) <= ECDSA_MAX_S && (v == 27 || v == 28) && ecrecover(digest, v, r, s) == user;
    }

    function _checkActionPrice(uint256 price, uint256 limit, bool buy) private pure {
        if (buy ? price > limit : price < limit) revert ActionPriceLimitExceeded();
    }

    function openPosition(uint256 marketId, uint256 margin, uint256 sizeUsd, bool isLong) external {
        this.dispatchAuthorizedPositionAction(
            AuthorizedPositionAction(msg.sender, marketId, PositionAction.OPEN, sizeUsd, margin, isLong, 0, 0, 0, 0), 0
        );
    }

    event PositionIncreased(address indexed account, uint256 indexed marketId, uint256 addedSizeUsd, uint256 addedMargin, uint256 fillPrice, uint256 entryPrice);

    function _openPosition(address account, uint256 marketId, uint256 margin, uint256 sizeUsd, bool isLong, uint256 priceLimit, uint256 verifiedPrice, bool increase)
        private
    {
        if (margin == 0 || sizeUsd == 0) revert InvalidAmount();
        uint256 orderLimit = maxOrderNotionalUsd[marketId];
        uint256 positionLimit = maxPositionNotionalUsd[marketId];
        if (orderLimit != 0 && sizeUsd > orderLimit) revert MaxOrderNotionalExceeded();
        Position storage existing = positions[account][marketId];
        if (increase) {
            if (!existing.open) revert PositionNotFound();
            if (existing.isLong != isLong) revert InvalidAmount();
        } else if (existing.open) revert PositionExists();
        uint256 totalSize = sizeUsd + existing.sizeUsd;
        if (positionLimit != 0 && totalSize > positionLimit) revert MaxPositionNotionalExceeded();
        uint256 oiLimit = maxOpenInterestUsd[marketId];
        if (oiLimit != 0 && openInterestUsd[marketId] + sizeUsd > oiLimit) revert MaxOpenInterestExceeded();
        FundingLedger storage ledger = fundingLedgers[account][marketId];
        if (!increase && (ledger.recognizedNetUnits != 0 || ledger.activeRemainderRay != 0)) revert FundingClosureBlocked();

        (address indexToken, address collateralToken, address oracle, uint32 maxLeverageBps, uint32 maintenance, bool active) =
            _riskContext(marketId);

        if (!active || registry.marketMode(marketId) != LQCFuturesMarketRegistry.MarketMode.ACTIVE) revert MarketInactive();

        uint256 price = _price(marketId, indexToken, oracle, verifiedPrice);
        if (priceLimit != 0) _checkActionPrice(price, priceLimit, isLong);
        uint256 entry = price;
        uint256 totalMargin = margin;
        uint256 eligible = margin;
        if (increase) {
            _settleFundingCheckpoint(account, marketId, collateralToken, existing);
            entry = fundingMath.increasedEntry(existing.sizeUsd, existing.entryPrice, sizeUsd, price, isLong);
            totalMargin += existing.margin;
            int256 pnl = _pnl(totalSize, entry, isLong, price);
            eligible = totalMargin;
            if (pnl < 0) {
                eligible = _afterLoss(eligible, pnl);
            }
            if (eligible <= totalSize * maintenance / BPS) revert LeverageTooHigh();
        }
        if (totalSize * BPS > eligible * uint256(maxLeverageBps)) revert LeverageTooHigh();
        vault.lockCollateral(account, collateralToken, margin);
        _chargeTradingFee(account, marketId, collateralToken, sizeUsd);

        positions[account][marketId] =
            Position({margin: totalMargin, sizeUsd: totalSize, entryPrice: entry, isLong: isLong, open: true});
        openInterestUsd[marketId] += sizeUsd;
        positionFundingEntryRay[account][marketId] = fundingStates[marketId].cumulativeFundingPerUsdRay;

        if (increase) {
            emit PositionIncreased(account, marketId, sizeUsd, margin, price, entry);
        } else {
            ++positionIds[account][marketId];
            emit PositionOpened(account, marketId, isLong, margin, sizeUsd, price);
        }
    }

    /// @notice Settles the caller's funding cash against the dedicated Futures funding pool.
    /// @dev Negative payment debits available balance; positive payment consumes previously collected pool funds.
    function settleFunding(uint256 marketId) external returns (int256 payment) {
        Position memory position = positions[msg.sender][marketId];
        if (!position.open) revert PositionNotFound();
        (, address collateralToken,,,,) = _riskContext(marketId);
        payment = _settleFundingCheckpoint(msg.sender, marketId, collateralToken, position);
    }

    function previewFundingPayment(address account, uint256 marketId) public view returns (int256 payment) {
        Position memory position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();
        (payment,,) = _quoteFunding(account, marketId, position);
    }

    function _quoteFunding(address account, uint256 marketId, Position memory position)
        private view returns (int256 payment, int256 recognized, int256 remainder)
    {
        FundingLedger memory ledger = fundingLedgers[account][marketId];
        FundingState storage state = fundingStates[marketId];
        return fundingMath.quote(
            ledger.recognizedNetUnits,
            ledger.activeRemainderRay,
            state.configured,
            state.cumulativeFundingPerUsdRay,
            positionFundingEntryRay[account][marketId],
            position.sizeUsd,
            position.isLong
        );
    }

    function _addFunding(int256 a, int256 b) private pure returns (int256) {
        unchecked {
            int256 sum = a + b;
            if (b > 0 ? sum < a : sum > a) revert FundingOverflow();
            return sum;
        }
    }

    /// @notice Closed claims and debts are recorded only; final disposition is unapproved.
    function finalizeClosedFunding(uint256) external pure {
        revert ClosedFundingSettlementBlocked();
    }

    function _archiveFunding(address account, uint256 marketId, address collateralToken) private {
        FundingLedger storage ledger = fundingLedgers[account][marketId];
        int256 remainder = ledger.activeRemainderRay;
        if (remainder <= -int256(FUNDING_RAY) || remainder >= int256(FUNDING_RAY)) revert FundingClosureBlocked();
        if (remainder > 0) {
            uint256 credit = uint256(remainder);
            if (ledger.closedCreditRay > type(uint256).max - credit) revert FundingClosureBlocked();
            ledger.closedCreditRay += credit;
        } else if (remainder < 0) {
            uint256 debt = uint256(-remainder);
            if (ledger.closedDebtRay > type(uint256).max - debt) revert FundingClosureBlocked();
            ledger.closedDebtRay += debt;
        }
        emit ClosedFundingRecorded(account, marketId, collateralToken, ledger.recognizedNetUnits, remainder);
        ledger.recognizedNetUnits = 0;
        ledger.activeRemainderRay = 0;
    }

    /// @notice Reduces part or all of the caller's position at the current Oracle price.
    /// @dev Outstanding voluntary funding is settled before size changes, preventing funding evasion.
    function reducePosition(uint256 marketId, uint256 reduceSizeUsd)
        external
        returns (uint256 releasedMargin, int256 realizedPnl, uint256 exitPrice)
    {
        (releasedMargin, realizedPnl, exitPrice,) = _reducePosition(msg.sender, marketId, reduceSizeUsd, 0, 0);
    }

    function closePosition(uint256 marketId) external {
        _closePosition(msg.sender, marketId, 0, 0, 0);
    }

    function _closePosition(address account, uint256 marketId, uint256 expectedSize, uint256 priceLimit, uint256 verifiedPrice) private {
        Position storage position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();
        if (expectedSize != 0 && position.sizeUsd != expectedSize) revert PositionIdentityMismatch();

        (, int256 pnl, uint256 price, uint256 remainingSize) =
            _reducePosition(account, marketId, position.sizeUsd, priceLimit, verifiedPrice);

        if (remainingSize != 0) revert InvalidReduction();
        emit PositionClosed(account, marketId, price, pnl);
    }

    function liquidate(address account, uint256 marketId) external {
        this.settleLiquidation(msg.sender, account, marketId, 0);
    }

    function settleLiquidation(address liquidator, address account, uint256 marketId, uint256 verifiedPrice) external onlyEngine {
        Position storage stored = positions[account][marketId];
        if (!stored.open) revert PositionNotFound();

        (address indexToken, address collateralToken, address oracle, , uint32 maintenanceMarginBps, ) = _riskContext(marketId);

        Position memory position = stored;
        position.margin = _settleLiquidationFundingCheckpoint(
            account,
            marketId,
            collateralToken,
            position
        );
        stored.margin = position.margin;

        uint256 price = _price(marketId, indexToken, oracle, verifiedPrice);
        (uint256 reduceSizeUsd, bool fullLiquidation, int256 pnl, int256 realizedPnl) = fundingMath.liquidationQuote(
            position.sizeUsd, position.entryPrice, position.isLong, position.margin, price, maintenanceMarginBps,
            liquidationReductionBps[marketId], liquidationMinRemainingSizeUsd[marketId]
        );

        if (fullLiquidation) {
            _archiveFunding(account, marketId, collateralToken);
            openInterestUsd[marketId] -= position.sizeUsd;
            _eraseClosedPosition(account, marketId);
            _settle(account, marketId, collateralToken, position.margin, pnl);
            emit PositionLiquidated(account, marketId, liquidator, price, pnl);
            return;
        }

        uint256 remainingSizeUsd = position.sizeUsd - reduceSizeUsd;
        uint256 remainingMargin = position.margin;

        if (realizedPnl < 0) {
            uint256 realizedLoss = uint256(-realizedPnl);
            vault.settlePnL(account, collateralToken, -int256(realizedLoss));
            remainingMargin -= realizedLoss;
        } else if (realizedPnl > 0) {
            vault.settlePnL(account, collateralToken, realizedPnl);
        }

        stored.sizeUsd = remainingSizeUsd;
        stored.margin = remainingMargin;
        openInterestUsd[marketId] -= reduceSizeUsd;

        emit PositionReduced(
            account,
            marketId,
            reduceSizeUsd,
            0,
            remainingSizeUsd,
            remainingMargin,
            price,
            realizedPnl
        );
        emit PositionPartiallyLiquidated(
            account,
            marketId,
            liquidator,
            reduceSizeUsd,
            remainingSizeUsd,
            remainingMargin,
            price,
            realizedPnl
        );
    }

    function getPositionPnl(address account, uint256 marketId)
        external
        view
        returns (int256 pnl, uint256 markPrice)
    {
        Position storage position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();

        markPrice = _marketPrice(marketId, 0);
        pnl = _pnl(position.sizeUsd, position.entryPrice, position.isLong, markPrice);
    }

    function _reducePosition(address account, uint256 marketId, uint256 reduceSizeUsd, uint256 priceLimit, uint256 verifiedPrice)
        private
        returns (uint256 releasedMargin, int256 realizedPnl, uint256 exitPrice, uint256 remainingSizeUsd)
    {
        Position storage stored = positions[account][marketId];
        if (!stored.open) revert PositionNotFound();

        Position memory beforePosition = stored;
        if (reduceSizeUsd == 0 || reduceSizeUsd > beforePosition.sizeUsd) revert InvalidReduction();

        (address indexToken, address collateralToken, address oracle,,,) = _riskContext(marketId);

        _settleFundingCheckpoint(account, marketId, collateralToken, beforePosition);
        exitPrice = _price(marketId, indexToken, oracle, verifiedPrice);
        if (priceLimit != 0) _checkActionPrice(exitPrice, priceLimit, !beforePosition.isLong);

        releasedMargin = beforePosition.margin * reduceSizeUsd / beforePosition.sizeUsd;
        if (releasedMargin == 0) revert InvalidReduction();

        realizedPnl = _pnl(reduceSizeUsd, beforePosition.entryPrice, beforePosition.isLong, exitPrice);

        bool fullReduction = reduceSizeUsd == beforePosition.sizeUsd;
        if (!fullReduction) {
            if (int256(releasedMargin) + realizedPnl <= 0) revert PartialReductionWouldCreateBadDebt();

            remainingSizeUsd = beforePosition.sizeUsd - reduceSizeUsd;
            uint256 remainingMargin = beforePosition.margin - releasedMargin;
            if (remainingSizeUsd == 0 || remainingMargin == 0) revert InvalidReduction();

            stored.sizeUsd = remainingSizeUsd;
            stored.margin = remainingMargin;
            openInterestUsd[marketId] -= reduceSizeUsd;

            _settle(account, marketId, collateralToken, releasedMargin, realizedPnl);
            _chargeTradingFee(account, marketId, collateralToken, reduceSizeUsd);

            emit PositionReduced(
                account,
                marketId,
                reduceSizeUsd,
                releasedMargin,
                remainingSizeUsd,
                remainingMargin,
                exitPrice,
                realizedPnl
            );
            return (releasedMargin, realizedPnl, exitPrice, remainingSizeUsd);
        }

        _archiveFunding(account, marketId, collateralToken);
        openInterestUsd[marketId] -= reduceSizeUsd;
        _eraseClosedPosition(account, marketId);
        _settle(account, marketId, collateralToken, releasedMargin, realizedPnl);
        _chargeTradingFee(account, marketId, collateralToken, reduceSizeUsd);

        emit PositionReduced(
            account,
            marketId,
            reduceSizeUsd,
            releasedMargin,
            0,
            0,
            exitPrice,
            realizedPnl
        );
        return (releasedMargin, realizedPnl, exitPrice, 0);
    }

    function _eraseClosedPosition(address account, uint256 marketId) private {
        delete positions[account][marketId];
        delete positionFundingEntryRay[account][marketId];
    }

    function _settleLiquidationFundingCheckpoint(
        address account,
        uint256 marketId,
        address collateralToken,
        Position memory position
    ) private returns (uint256 adjustedMargin) {
        FundingState memory state = fundingStates[marketId];
        adjustedMargin = position.margin;

        if (!state.configured) {
            positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
            return adjustedMargin;
        }

        (int256 payment, int256 recognized, int256 remainder) = _quoteFunding(account, marketId, position);
        uint256 marginCredit;
        uint256 marginDebit;
        uint256 insuranceCovered;
        uint256 residual;
        if (payment != 0) {
            uint256 maxCoverage;
            if (payment < 0) {
                uint256 debit = uint256(-payment);
                uint256 available = vault.availableBalance(account, collateralToken);
                uint256 collectible = position.margin;
                if (available > type(uint256).max - collectible) revert InvalidAmount();
                collectible += available;

                uint256 shortfall = debit > collectible ? debit - collectible : 0;
                maxCoverage = _maxCoverage(shortfall, marketId);
            }
            (marginCredit, marginDebit, insuranceCovered, residual) = vault.settleLiquidationFunding(
                account, collateralToken, payment, position.margin, maxCoverage
            );
        }

        adjustedMargin = position.margin + marginCredit - marginDebit;
        _recordFundingCheckpoint(account, marketId, state.cumulativeFundingPerUsdRay, payment, residual, recognized, remainder);
        if (payment != 0) {
            emit LiquidationFundingApplied(
                account,
                marketId,
                payment,
                marginCredit,
                marginDebit,
                insuranceCovered,
                residual
            );
        }
    }

    function _chargeTradingFee(address account, uint256 marketId, address collateralToken, uint256 notionalUsd) private {
        uint256 feeBps = tradingFeeBps[marketId];
        if (feeBps == 0) return;
        if (notionalUsd > type(uint256).max / feeBps) revert InvalidAmount();
        uint256 fee = notionalUsd * feeBps / BPS;
        if (fee == 0) return;
        uint256 insuranceAmount = fee * insuranceFeeShareBps[marketId] / BPS;
        vault.collectTradingFee(account, collateralToken, fee, insuranceAmount);
        emit TradingFeeCharged(account, marketId, notionalUsd, fee, insuranceAmount);
    }

    function _settleFundingCheckpoint(
        address account,
        uint256 marketId,
        address collateralToken,
        Position memory position
    ) private returns (int256 payment) {
        FundingState memory state = fundingStates[marketId];
        if (!state.configured) {
            positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
            return 0;
        }

        int256 recognized;
        int256 remainder;
        (payment, recognized, remainder) = _quoteFunding(account, marketId, position);
        if (payment != 0) vault.settleFunding(account, collateralToken, payment);

        _recordFundingCheckpoint(account, marketId, state.cumulativeFundingPerUsdRay, payment, 0, recognized, remainder);
    }

    function _recordFundingCheckpoint(
        address account, uint256 marketId, int256 indexRay, int256 payment, uint256 residual, int256 recognized, int256 remainder
    ) private {
        FundingLedger storage ledger = fundingLedgers[account][marketId];
        ledger.recognizedNetUnits = recognized;
        ledger.activeRemainderRay = remainder;
        positionFundingEntryRay[account][marketId] = indexRay;
        emit FundingSettled(account, marketId, payment, indexRay);
        emit FundingCheckpointRecorded(account, marketId, payment, _addFunding(payment, int256(residual)), residual, recognized, remainder);
    }

    function _settle(address account, uint256 marketId, address collateralToken, uint256 margin, int256 pnl) private {
        if (pnl >= 0) {
            if (margin != 0) vault.unlockCollateral(account, collateralToken, margin);
            if (pnl > 0) vault.settlePnL(account, collateralToken, pnl);
            return;
        }

        uint256 loss = uint256(-pnl);
        uint256 charged = loss < margin ? loss : margin;
        vault.settlePnL(account, collateralToken, -int256(charged));
        if (charged < margin) {
            vault.unlockCollateral(account, collateralToken, margin - charged);
            return;
        }

        uint256 deficit = loss - charged;
        if (deficit == 0) return;

        uint256 maxCoverage = _maxCoverage(deficit, marketId);
        (uint256 covered, uint256 residual) = vault.coverBadDebt(collateralToken, deficit, maxCoverage);

        emit PositionDeficitRecorded(account, marketId, deficit, covered, residual);
    }

    function _maxCoverage(uint256 deficit, uint256 marketId) private view returns (uint256) {
        uint256 coverageBps = maxInsuranceCoverageBps[marketId];
        if (coverageBps != 0 && deficit > type(uint256).max / coverageBps) revert InvalidAmount();
        return deficit * coverageBps / BPS;
    }

    function _pnl(uint256 sizeUsd, uint256 entryPrice, bool isLong, uint256 price) private pure returns (int256) {
        int256 entry = int256(entryPrice);
        int256 current = int256(price);
        int256 difference = isLong ? current - entry : entry - current;
        return difference * int256(sizeUsd) / entry;
    }

    function _isSessionOracle(address oracle) private view returns (bool) {
        try ILQCSessionExecutionOracle(oracle).requiresSessionProof() returns (bool required) {
            return required;
        } catch {
            return false;
        }
    }

    function _requirePriceMode(uint256 marketId) private view {
        if (registry.marketMode(marketId) == LQCFuturesMarketRegistry.MarketMode.HALTED) revert MarketInactive();
        if (!registry.isRecoveryOracleApproved(marketId)) revert UnapprovedRecoveryOracle();
    }

    function _verifySessionPrice(uint256 marketId, bytes calldata signedUpdate) private returns (uint256 price) {
        (address indexToken,, address oracle,,,) = _riskContext(marketId);
        _requirePriceMode(marketId);
        if (registry.wrapperNominationVersion(marketId) == 0 || !_isSessionOracle(oracle)) {
            revert WrapperExecutionUnavailable();
        }
        uint256 epoch = registry.recoveryApprovalEpoch(marketId);
        uint256 updatedAt;
        (price, updatedAt) = ILQCSessionExecutionOracle(oracle).verifyExecutionPrice{value: msg.value}(
            marketId, indexToken, signedUpdate
        );
        _checkOraclePrice(price, updatedAt);
        (,, address currentOracle,,,) = _riskContext(marketId);
        if (currentOracle != oracle || registry.recoveryApprovalEpoch(marketId) != epoch) revert UnapprovedRecoveryOracle();
        _requirePriceMode(marketId);
    }

    function _riskContext(uint256 marketId) private view returns (address indexToken, address collateralToken, address oracle,
        uint32 leverage, uint32 maintenance, bool active)
    {
        (, indexToken, collateralToken, oracle, leverage, maintenance, active) = registry.markets(marketId);
    }

    function _marketPrice(uint256 marketId, uint256 verifiedPrice) private view returns (uint256) {
        (address indexToken,, address oracle,,,) = _riskContext(marketId);
        return _price(marketId, indexToken, oracle, verifiedPrice);
    }

    function _price(uint256 marketId, address indexToken, address oracle, uint256 verifiedPrice)
        private view returns (uint256 price)
    {
        _requirePriceMode(marketId);
        if (verifiedPrice != 0) return verifiedPrice;
        if (sessionExecuting || _isSessionOracle(oracle)) revert WrapperExecutionUnavailable();
        uint256 updatedAt;
        (price, updatedAt) = ILQCFuturesOracle(oracle).getPrice(indexToken);
        _checkOraclePrice(price, updatedAt);
    }

    function _checkOraclePrice(uint256 price, uint256 updatedAt) private view {
        if (price == 0 || updatedAt == 0 || updatedAt > block.timestamp) revert InvalidOraclePrice();
        if (block.timestamp - updatedAt > MAX_ORACLE_DELAY) revert StaleOraclePrice();
    }
}
