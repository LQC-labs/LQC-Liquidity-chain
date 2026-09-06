// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Timelock-owned token allowlist and transaction/daily swap caps.
contract LQCRiskRegistry {
    struct TokenLimits { bool allowed; uint256 maxPerTransaction; uint256 maxPerDay; }
    struct DailyUsage { uint64 day; uint192 amount; }

    address public owner;
    address public pendingOwner;
    address public riskAdmin;
    address public executor;
    mapping(address => TokenLimits) public tokenLimits;
    mapping(address => DailyUsage) public dailyUsage;
    mapping(bytes32 => mapping(address => uint256)) public dexTokenCap;

    event TokenLimitsSet(address indexed token, bool allowed, uint256 maxPerTransaction, uint256 maxPerDay);
    event DexTokenCapSet(bytes32 indexed dexId, address indexed token, uint256 cap);
    event RiskAdminSet(address indexed riskAdmin);
    event ExecutorSet(address indexed executor);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SwapConsumed(address indexed tokenIn, address indexed tokenOut, uint256 totalAmountIn, uint256 day);

    error Forbidden();
    error ZeroAddress();
    error InvalidLimits();
    error TokenNotAllowed();
    error TransactionCapExceeded();
    error DailyCapExceeded();
    error DexCapExceeded();
    error InvalidRoutes();

    modifier onlyOwner() { if (msg.sender != owner) revert Forbidden(); _; }

    constructor(address owner_, address riskAdmin_) {
        if (owner_ == address(0) || riskAdmin_ == address(0)) revert ZeroAddress();
        owner = owner_;
        riskAdmin = riskAdmin_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function setExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
        emit ExecutorSet(executor_);
    }

    function setRiskAdmin(address riskAdmin_) external onlyOwner {
        if (riskAdmin_ == address(0)) revert ZeroAddress();
        riskAdmin = riskAdmin_;
        emit RiskAdminSet(riskAdmin_);
    }

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    function setTokenLimits(address token, bool allowed, uint256 maxPerTransaction, uint256 maxPerDay)
        external onlyOwner
    {
        if (token == address(0)) revert ZeroAddress();
        if (allowed && (maxPerTransaction == 0 || maxPerDay < maxPerTransaction || maxPerDay > type(uint192).max)) {
            revert InvalidLimits();
        }
        tokenLimits[token] = TokenLimits(allowed, maxPerTransaction, maxPerDay);
        emit TokenLimitsSet(token, allowed, maxPerTransaction, maxPerDay);
    }

    function setDexTokenCap(bytes32 dexId, address token, uint256 cap) external onlyOwner {
        if (dexId == bytes32(0) || token == address(0)) revert ZeroAddress();
        dexTokenCap[dexId][token] = cap;
        emit DexTokenCapSet(dexId, token, cap);
    }

    /// @notice Risk multisig may only reduce active limits, never expand permissions.
    function reduceLimits(address token, uint256 newPerTransaction, uint256 newPerDay) external {
        if (msg.sender != riskAdmin) revert Forbidden();
        TokenLimits storage limits = tokenLimits[token];
        if (!limits.allowed || newPerTransaction > limits.maxPerTransaction || newPerDay > limits.maxPerDay ||
            newPerTransaction == 0 || newPerDay < newPerTransaction || newPerDay > type(uint192).max) {
            revert InvalidLimits();
        }
        limits.maxPerTransaction = newPerTransaction;
        limits.maxPerDay = newPerDay;
        emit TokenLimitsSet(token, true, newPerTransaction, newPerDay);
    }

    function consumeSwap(address tokenIn, address tokenOut, bytes32[] calldata dexIds, uint256[] calldata amountsIn)
        external
    {
        if (msg.sender != executor) revert Forbidden();
        if (dexIds.length == 0 || dexIds.length != amountsIn.length) revert InvalidRoutes();
        TokenLimits memory inputLimits = tokenLimits[tokenIn];
        if (!inputLimits.allowed || !tokenLimits[tokenOut].allowed) revert TokenNotAllowed();
        uint256 total;
        for (uint256 i; i < dexIds.length; ++i) {
            uint256 amount = amountsIn[i];
            uint256 dexCap = dexTokenCap[dexIds[i]][tokenIn];
            if (amount == 0 || dexCap == 0 || amount > dexCap) revert DexCapExceeded();
            total += amount;
        }
        if (total > inputLimits.maxPerTransaction) revert TransactionCapExceeded();
        uint64 currentDay = uint64(block.timestamp / 1 days);
        DailyUsage storage usage = dailyUsage[tokenIn];
        uint256 used = usage.day == currentDay ? usage.amount : 0;
        if (used + total > inputLimits.maxPerDay) revert DailyCapExceeded();
        usage.day = currentDay;
        usage.amount = uint192(used + total);
        emit SwapConsumed(tokenIn, tokenOut, total, currentDay);
    }
}
