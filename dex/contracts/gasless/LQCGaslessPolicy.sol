// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Testnet-first eligibility and budget guard for future sponsored LQC transactions.
/// @dev This policy does not relay transactions or custody funds. A reviewed paymaster/relayer
///      must call authorizeSponsorship immediately before consuming sponsorship budget.
contract LQCGaslessPolicy {
    struct WalletDailyUsage {
        uint64 day;
        uint32 transactions;
        uint160 gasSponsored;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    address public executor;
    uint256 public immutable expectedChainId;
    uint256 public minimumNotionalUsdE18;
    uint256 public maxGasPerTransaction;
    uint256 public dailyGasBudget;
    uint32 public maxTransactionsPerWalletPerDay;
    bool public paused;

    mapping(address => bool) public allowedTarget;
    mapping(address => bool) public allowedToken;
    mapping(address => WalletDailyUsage) public walletDailyUsage;
    uint64 public protocolBudgetDay;
    uint192 public protocolGasSponsored;

    event SponsorshipAuthorized(address indexed user, address indexed target, address indexed token, uint256 notionalUsdE18, uint256 gasCostWei, uint256 day);
    event EligibilitySet(address indexed subject, bool indexed isTarget, bool allowed);
    event LimitsSet(uint256 minimumNotionalUsdE18, uint256 maxGasPerTransaction, uint256 dailyGasBudget, uint32 maxTransactionsPerWalletPerDay);
    event ExecutorSet(address indexed executor);
    event GuardianSet(address indexed guardian);
    event PauseChanged(bool paused, address indexed caller);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error WrongChain();
    error Paused();
    error TargetNotAllowed();
    error TokenNotAllowed();
    error NativeGasSufficient();
    error NotionalTooLow();
    error TransactionGasCapExceeded();
    error WalletDailyQuotaExceeded();
    error ProtocolDailyBudgetExceeded();
    error InvalidLimits();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    constructor(
        address owner_,
        address guardian_,
        uint256 expectedChainId_,
        uint256 minimumNotionalUsdE18_,
        uint256 maxGasPerTransaction_,
        uint256 dailyGasBudget_,
        uint32 maxTransactionsPerWalletPerDay_
    ) {
        if (owner_ == address(0) || guardian_ == address(0) || expectedChainId_ == 0) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        expectedChainId = expectedChainId_;
        _setLimits(minimumNotionalUsdE18_, maxGasPerTransaction_, dailyGasBudget_, maxTransactionsPerWalletPerDay_);
        emit OwnershipTransferred(address(0), owner_);
    }

    function setExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
        emit ExecutorSet(executor_);
    }

    function setGuardian(address guardian_) external onlyOwner {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function setEligibility(address subject, bool isTarget, bool allowed) external onlyOwner {
        if (subject == address(0)) revert ZeroAddress();
        if (isTarget) allowedTarget[subject] = allowed;
        else allowedToken[subject] = allowed;
        emit EligibilitySet(subject, isTarget, allowed);
    }

    function setLimits(
        uint256 minimumNotionalUsdE18_,
        uint256 maxGasPerTransaction_,
        uint256 dailyGasBudget_,
        uint32 maxTransactionsPerWalletPerDay_
    ) external onlyOwner {
        _setLimits(minimumNotionalUsdE18_, maxGasPerTransaction_, dailyGasBudget_, maxTransactionsPerWalletPerDay_);
    }

    function pause() external {
        if (msg.sender != guardian && msg.sender != owner) revert Forbidden();
        paused = true;
        emit PauseChanged(true, msg.sender);
    }

    function resume() external onlyOwner {
        paused = false;
        emit PauseChanged(false, msg.sender);
    }

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function authorizeSponsorship(
        address user,
        address target,
        address token,
        uint256 notionalUsdE18,
        uint256 gasCostWei
    ) external {
        if (msg.sender != executor) revert Forbidden();
        if (block.chainid != expectedChainId) revert WrongChain();
        if (paused) revert Paused();
        if (user == address(0) || target == address(0) || token == address(0)) revert ZeroAddress();
        if (!allowedTarget[target]) revert TargetNotAllowed();
        if (!allowedToken[token]) revert TokenNotAllowed();
        if (user.balance >= gasCostWei) revert NativeGasSufficient();
        if (notionalUsdE18 < minimumNotionalUsdE18) revert NotionalTooLow();
        if (gasCostWei == 0 || gasCostWei > maxGasPerTransaction) revert TransactionGasCapExceeded();

        uint64 currentDay = uint64(block.timestamp / 1 days);
        WalletDailyUsage storage walletUsage = walletDailyUsage[user];
        uint32 usedTransactions = walletUsage.day == currentDay ? walletUsage.transactions : 0;
        uint256 walletGas = walletUsage.day == currentDay ? walletUsage.gasSponsored : 0;
        if (usedTransactions >= maxTransactionsPerWalletPerDay) revert WalletDailyQuotaExceeded();

        uint256 protocolUsed = protocolBudgetDay == currentDay ? protocolGasSponsored : 0;
        if (protocolUsed + gasCostWei > dailyGasBudget) revert ProtocolDailyBudgetExceeded();

        walletUsage.day = currentDay;
        walletUsage.transactions = usedTransactions + 1;
        walletUsage.gasSponsored = uint160(walletGas + gasCostWei);
        protocolBudgetDay = currentDay;
        protocolGasSponsored = uint192(protocolUsed + gasCostWei);

        emit SponsorshipAuthorized(user, target, token, notionalUsdE18, gasCostWei, currentDay);
    }

    function _setLimits(
        uint256 minimumNotionalUsdE18_,
        uint256 maxGasPerTransaction_,
        uint256 dailyGasBudget_,
        uint32 maxTransactionsPerWalletPerDay_
    ) private {
        if (
            minimumNotionalUsdE18_ == 0 ||
            maxGasPerTransaction_ == 0 ||
            dailyGasBudget_ < maxGasPerTransaction_ ||
            dailyGasBudget_ > type(uint160).max ||
            maxTransactionsPerWalletPerDay_ == 0 ||
            maxTransactionsPerWalletPerDay_ > 5
        ) revert InvalidLimits();
        minimumNotionalUsdE18 = minimumNotionalUsdE18_;
        maxGasPerTransaction = maxGasPerTransaction_;
        dailyGasBudget = dailyGasBudget_;
        maxTransactionsPerWalletPerDay = maxTransactionsPerWalletPerDay_;
        emit LimitsSet(minimumNotionalUsdE18_, maxGasPerTransaction_, dailyGasBudget_, maxTransactionsPerWalletPerDay_);
    }
}
