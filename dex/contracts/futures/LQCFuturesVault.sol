// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

/// @notice Collateral custody and accounting for LQC Flow Futures.
/// @dev Only an authorized engine may lock/unlock collateral or settle PnL/funding/deficits.
contract LQCFuturesVault {
    using SafeTransferLib for address;

    address public owner;
    address public pendingOwner;
    address public engine;
    uint256 private unlocked = 1;

    mapping(address => bool) public supportedCollateral;
    mapping(address => mapping(address => uint256)) public availableBalance;
    mapping(address => mapping(address => uint256)) public lockedBalance;
    mapping(address => uint256) public totalAccounted;
    mapping(address => uint256) public fundingPoolBalance;
    mapping(address => uint256) public insuranceFeeReserve;
    mapping(address => uint256) public treasuryFeeReserve;
    mapping(address => uint256) public residualBadDebt;
    mapping(address => uint256) public totalInsuranceCovered;

    event Deposit(address indexed account, address indexed token, uint256 amount);
    event Withdrawal(address indexed account, address indexed token, uint256 amount);
    event CollateralLocked(address indexed account, address indexed token, uint256 amount);
    event CollateralUnlocked(address indexed account, address indexed token, uint256 amount);
    event PnLSettled(address indexed account, address indexed token, int256 pnl);
    event FundingSettled(address indexed account, address indexed token, int256 payment, uint256 fundingPoolBalance);
    event LiquidationFundingSettled(
        address indexed account,
        address indexed token,
        int256 payment,
        uint256 marginCredit,
        uint256 marginDebit,
        uint256 insuranceCovered,
        uint256 residualAdded,
        uint256 fundingPoolBalance
    );
    event TradingFeeCollected(address indexed account, address indexed token, uint256 fee, uint256 insuranceAmount, uint256 treasuryAmount);
    event BadDebtCovered(
        address indexed token,
        uint256 requestedDeficit,
        uint256 maxInsuranceCoverage,
        uint256 insuranceCovered,
        uint256 residualAdded,
        uint256 insuranceReserveRemaining,
        uint256 totalResidualBadDebt
    );
    event CollateralSupportChanged(address indexed token, bool supported);
    event EngineChanged(address indexed previousEngine, address indexed newEngine);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error UnsupportedCollateral();
    error InvalidAmount();
    error InsufficientAvailableBalance();
    error InsufficientLockedBalance();
    error InsufficientVaultLiquidity();
    error InsufficientFundingPool();
    error Locked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier onlyEngine() {
        if (msg.sender != engine) revert Forbidden();
        _;
    }

    modifier lock() {
        if (unlocked != 1) revert Locked();
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function setEngine(address newEngine) external onlyOwner {
        if (newEngine == address(0)) revert ZeroAddress();
        address previous = engine;
        engine = newEngine;
        emit EngineChanged(previous, newEngine);
    }

    function setSupportedCollateral(address token, bool supported) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        supportedCollateral[token] = supported;
        emit CollateralSupportChanged(token, supported);
    }

    function deposit(address token, uint256 amount) external lock {
        if (!supportedCollateral[token]) revert UnsupportedCollateral();
        if (amount == 0) revert InvalidAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        availableBalance[msg.sender][token] += amount;
        totalAccounted[token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external lock {
        if (amount == 0) revert InvalidAmount();
        uint256 available = availableBalance[msg.sender][token];
        if (available < amount) revert InsufficientAvailableBalance();
        availableBalance[msg.sender][token] = available - amount;
        totalAccounted[token] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawal(msg.sender, token, amount);
    }

    function lockCollateral(address account, address token, uint256 amount) external onlyEngine {
        if (amount == 0) revert InvalidAmount();
        uint256 available = availableBalance[account][token];
        if (available < amount) revert InsufficientAvailableBalance();
        availableBalance[account][token] = available - amount;
        lockedBalance[account][token] += amount;
        emit CollateralLocked(account, token, amount);
    }

    function unlockCollateral(address account, address token, uint256 amount) external onlyEngine {
        if (amount == 0) revert InvalidAmount();
        uint256 lockedAmount = lockedBalance[account][token];
        if (lockedAmount < amount) revert InsufficientLockedBalance();
        lockedBalance[account][token] = lockedAmount - amount;
        availableBalance[account][token] += amount;
        emit CollateralUnlocked(account, token, amount);
    }

    function settleFunding(address account, address token, int256 payment) external onlyEngine {
        if (payment > 0) {
            uint256 credit = uint256(payment);
            uint256 pool = fundingPoolBalance[token];
            if (pool < credit) revert InsufficientFundingPool();
            fundingPoolBalance[token] = pool - credit;
            availableBalance[account][token] += credit;
            totalAccounted[token] += credit;
        } else if (payment < 0) {
            uint256 debit = uint256(-payment);
            uint256 available = availableBalance[account][token];
            if (available < debit) revert InsufficientAvailableBalance();
            availableBalance[account][token] = available - debit;
            totalAccounted[token] -= debit;
            fundingPoolBalance[token] += debit;
        }
        emit FundingSettled(account, token, payment, fundingPoolBalance[token]);
    }

    /// @notice Crystallizes pending funding into isolated-margin risk during liquidation.
    /// @dev Positive funding credits locked margin. Negative funding consumes this position's
    ///      locked margin first, then available Futures collateral, then bounded Insurance.
    ///      Any uncovered remainder is explicit residual bad debt.
    function settleLiquidationFunding(
        address account,
        address token,
        int256 payment,
        uint256 maxLockedDebit,
        uint256 maxInsuranceCoverage
    )
        external
        onlyEngine
        returns (uint256 marginCredit, uint256 marginDebit, uint256 insuranceCovered, uint256 residual)
    {
        if (payment > 0) {
            uint256 credit = uint256(payment);
            uint256 pool = fundingPoolBalance[token];
            if (pool < credit) revert InsufficientFundingPool();

            fundingPoolBalance[token] = pool - credit;
            lockedBalance[account][token] += credit;
            totalAccounted[token] += credit;
            marginCredit = credit;
        } else if (payment < 0) {
            uint256 debit = uint256(-payment);

            uint256 locked = lockedBalance[account][token];
            uint256 lockedLimit = locked < maxLockedDebit ? locked : maxLockedDebit;
            marginDebit = debit < lockedLimit ? debit : lockedLimit;
            if (marginDebit != 0) {
                lockedBalance[account][token] = locked - marginDebit;
                totalAccounted[token] -= marginDebit;
                fundingPoolBalance[token] += marginDebit;
            }

            uint256 remaining = debit - marginDebit;
            if (remaining != 0) {
                uint256 available = availableBalance[account][token];
                uint256 availableDebit = available < remaining ? available : remaining;
                if (availableDebit != 0) {
                    availableBalance[account][token] = available - availableDebit;
                    totalAccounted[token] -= availableDebit;
                    fundingPoolBalance[token] += availableDebit;
                    remaining -= availableDebit;
                }
            }

            if (remaining != 0) {
                uint256 allowed = maxInsuranceCoverage < remaining ? maxInsuranceCoverage : remaining;
                uint256 reserve = insuranceFeeReserve[token];
                insuranceCovered = reserve < allowed ? reserve : allowed;

                if (insuranceCovered != 0) {
                    insuranceFeeReserve[token] = reserve - insuranceCovered;
                    totalInsuranceCovered[token] += insuranceCovered;
                    fundingPoolBalance[token] += insuranceCovered;
                }

                residual = remaining - insuranceCovered;
                if (residual != 0) residualBadDebt[token] += residual;
            }
        }

        emit LiquidationFundingSettled(
            account,
            token,
            payment,
            marginCredit,
            marginDebit,
            insuranceCovered,
            residual,
            fundingPoolBalance[token]
        );
    }

    /// @notice Collect a Futures trading fee from available collateral and segregate protocol reserves.
    function collectTradingFee(address account, address token, uint256 fee, uint256 insuranceAmount) external onlyEngine {
        if (fee == 0 || insuranceAmount > fee) revert InvalidAmount();
        uint256 available = availableBalance[account][token];
        if (available < fee) revert InsufficientAvailableBalance();

        uint256 treasuryAmount = fee - insuranceAmount;
        availableBalance[account][token] = available - fee;
        totalAccounted[token] -= fee;
        insuranceFeeReserve[token] += insuranceAmount;
        treasuryFeeReserve[token] += treasuryAmount;

        emit TradingFeeCollected(account, token, fee, insuranceAmount, treasuryAmount);
    }

    /// @notice Applies only the bounded Insurance reserve to an explicit Futures deficit.
    /// @dev Insurance coverage frees reserved tokens into protocol loss-absorption liquidity.
    ///      Any uncovered amount is recorded as residual bad debt; Treasury/Funding/User balances are untouched.
    function coverBadDebt(address token, uint256 deficit, uint256 maxInsuranceCoverage)
        external
        onlyEngine
        returns (uint256 covered, uint256 residual)
    {
        if (deficit == 0) revert InvalidAmount();

        uint256 allowed = maxInsuranceCoverage < deficit ? maxInsuranceCoverage : deficit;
        uint256 reserve = insuranceFeeReserve[token];
        covered = reserve < allowed ? reserve : allowed;

        if (covered != 0) {
            insuranceFeeReserve[token] = reserve - covered;
            totalInsuranceCovered[token] += covered;
        }

        residual = deficit - covered;
        if (residual != 0) residualBadDebt[token] += residual;

        emit BadDebtCovered(
            token,
            deficit,
            maxInsuranceCoverage,
            covered,
            residual,
            insuranceFeeReserve[token],
            residualBadDebt[token]
        );
    }

    function isFullyBacked(address token) public view returns (bool) {
        return IERC20(token).balanceOf(address(this)) >=
            totalAccounted[token] + fundingPoolBalance[token] + insuranceFeeReserve[token] + treasuryFeeReserve[token];
    }

    /// @notice Economic solvency additionally requires no unresolved Futures bad debt.
    function isSolvent(address token) external view returns (bool) {
        return isFullyBacked(token) && residualBadDebt[token] == 0;
    }

    /// @notice Apply realized PnL after a position is reduced/closed.
    function settlePnL(address account, address token, int256 pnl) external onlyEngine {
        if (pnl > 0) {
            uint256 profit = uint256(pnl);
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            uint256 reserved =
                fundingPoolBalance[token] + insuranceFeeReserve[token] + treasuryFeeReserve[token];
            if (tokenBalance < totalAccounted[token] + reserved + profit) revert InsufficientVaultLiquidity();
            availableBalance[account][token] += profit;
            totalAccounted[token] += profit;
        } else if (pnl < 0) {
            uint256 loss = uint256(-pnl);
            uint256 lockedAmount = lockedBalance[account][token];
            if (lockedAmount < loss) revert InsufficientLockedBalance();
            lockedBalance[account][token] = lockedAmount - loss;
            totalAccounted[token] -= loss;
        }
        emit PnLSettled(account, token, pnl);
    }

    function transferOwnership(address newOwner) external onlyOwner {
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
}
