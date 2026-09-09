// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStrategyAdapter} from "./interfaces/ILQCStrategyAdapter.sol";

/// @notice Single-asset vault with a capped, separately approved strategy boundary.
/// @dev Strategy accounting is explicit so unsolicited token donations cannot inflate share value.
contract LQCLiquidityVault {
    using SafeTransferLib for address;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant MINIMUM_SHARES = 1_000;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_CONFIGURED_LOSS_BPS = 2_000;

    address public immutable asset;
    address public owner;
    address public pendingOwner;
    address public pauseAdmin;
    address public strategyAdmin;
    address public strategy;
    uint256 public depositCap;
    uint256 public accountedAssets;
    uint256 public strategyDebt;
    uint256 public strategyCap;
    uint256 public maxLossBps;
    uint256 public totalSupply;
    bool public depositsPaused;
    bool public allocationsPaused;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 private unlocked = 1;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed shareOwner, uint256 assets, uint256 shares);
    event DepositCapChanged(uint256 previousCap, uint256 newCap);
    event DepositPauseChanged(bool paused, address indexed caller);
    event PauseAdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event StrategyAdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event StrategyChanged(address indexed previousStrategy, address indexed newStrategy);
    event StrategyLimitsChanged(uint256 strategyCap, uint256 maxLossBps);
    event AllocationPauseChanged(bool paused, address indexed caller);
    event StrategyAllocation(address indexed strategy, uint256 assets, uint256 strategyDebt);
    event StrategyRecall(address indexed strategy, uint256 debtRepaid, uint256 assetsReceived, uint256 loss);
    event EmergencyStrategyRecall(address indexed strategy, uint256 debtRepaid, uint256 assetsReceived, uint256 loss);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error ZeroAmount();
    error DepositCapExceeded();
    error DepositsPaused();
    error InsufficientShares();
    error UnsupportedTokenBehavior();
    error Reentrancy();
    error InvalidStrategy();
    error StrategyHasDebt();
    error RecallExceedsDebt();
    error StrategyCapExceeded();
    error AllocationsPaused();
    error InsufficientIdleLiquidity();
    error LossLimitExceeded();
    error InvalidLossLimit();
    error EmergencyModeRequired();
    error Insolvent();

    modifier onlyOwner() { if (msg.sender != owner) revert Forbidden(); _; }
    modifier nonReentrant() { if (unlocked != 1) revert Reentrancy(); unlocked = 2; _; unlocked = 1; }

    constructor(address asset_, address owner_, uint256 depositCap_, string memory name_, string memory symbol_) {
        if (asset_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (depositCap_ == 0) revert ZeroAmount();
        asset = asset_;
        owner = owner_;
        pauseAdmin = owner_;
        strategyAdmin = owner_;
        depositCap = depositCap_;
        name = name_;
        symbol = symbol_;
        emit OwnershipTransferred(address(0), owner_);
        emit PauseAdminChanged(address(0), owner_);
        emit StrategyAdminChanged(address(0), owner_);
        emit DepositCapChanged(0, depositCap_);
    }

    function totalAssets() external view returns (uint256) { return accountedAssets; }

    function idleAssets() public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function accountedIdleAssets() public view returns (uint256) {
        return accountedAssets - strategyDebt;
    }

    function isInsolvent() public view returns (bool) {
        return totalSupply != 0 && accountedAssets == 0;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        if (isInsolvent()) revert Insolvent();
        return totalSupply == 0 ? assets : assets * totalSupply / accountedAssets;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return totalSupply == 0 ? shares : shares * accountedAssets / totalSupply;
    }

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (receiver == address(0)) revert ZeroAddress();
        if (assets == 0) revert ZeroAmount();
        if (depositsPaused) revert DepositsPaused();
        if (isInsolvent()) revert Insolvent();
        if (accountedAssets + assets > depositCap) revert DepositCapExceeded();
        uint256 supply = totalSupply;
        if (supply == 0) {
            if (assets <= MINIMUM_SHARES) revert InsufficientShares();
            shares = assets - MINIMUM_SHARES;
        } else {
            shares = assets * supply / accountedAssets;
            if (shares == 0) revert InsufficientShares();
        }
        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), assets);
        if (IERC20(asset).balanceOf(address(this)) - beforeBalance != assets) revert UnsupportedTokenBehavior();
        accountedAssets += assets;
        if (supply == 0) _mint(address(0), MINIMUM_SHARES);
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address shareOwner) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        shares = _ceilDiv(assets * totalSupply, accountedAssets);
        _withdraw(assets, shares, receiver, shareOwner);
    }

    function redeem(uint256 shares, address receiver, address shareOwner) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        assets = convertToAssets(shares);
        if (assets == 0) revert ZeroAmount();
        _withdraw(assets, shares, receiver, shareOwner);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) { _transfer(msg.sender, to, amount); return true; }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _spendAllowance(from, amount);
        _transfer(from, to, amount);
        return true;
    }

    function setDepositCap(uint256 newCap) external onlyOwner {
        if (newCap < accountedAssets) revert DepositCapExceeded();
        uint256 previous = depositCap;
        depositCap = newCap;
        emit DepositCapChanged(previous, newCap);
    }

    function setStrategy(address newStrategy) external onlyOwner {
        if (strategyDebt != 0) revert StrategyHasDebt();
        if (newStrategy != address(0)) {
            if (newStrategy.code.length == 0) revert InvalidStrategy();
            if (ILQCStrategyAdapter(newStrategy).asset() != asset ||
                ILQCStrategyAdapter(newStrategy).vault() != address(this)) revert InvalidStrategy();
        }
        address previous = strategy;
        strategy = newStrategy;
        emit StrategyChanged(previous, newStrategy);
    }

    function setStrategyLimits(uint256 newStrategyCap, uint256 newMaxLossBps) external onlyOwner {
        if (newStrategyCap < strategyDebt) revert StrategyCapExceeded();
        if (newMaxLossBps > MAX_CONFIGURED_LOSS_BPS) revert InvalidLossLimit();
        strategyCap = newStrategyCap;
        maxLossBps = newMaxLossBps;
        emit StrategyLimitsChanged(newStrategyCap, newMaxLossBps);
    }

    function allocateToStrategy(uint256 assets) external nonReentrant {
        if (msg.sender != owner && msg.sender != strategyAdmin) revert Forbidden();
        if (allocationsPaused) revert AllocationsPaused();
        if (strategy == address(0)) revert InvalidStrategy();
        if (assets == 0) revert ZeroAmount();
        if (strategyDebt + assets > strategyCap) revert StrategyCapExceeded();
        if (assets > accountedIdleAssets() || assets > idleAssets()) revert InsufficientIdleLiquidity();

        uint256 managedBefore = ILQCStrategyAdapter(strategy).totalManagedAssets();
        uint256 vaultBefore = idleAssets();
        asset.safeTransfer(strategy, assets);
        uint256 deployed = ILQCStrategyAdapter(strategy).deploy(assets);
        uint256 managedAfter = ILQCStrategyAdapter(strategy).totalManagedAssets();
        if (vaultBefore - idleAssets() != assets || deployed != assets || managedAfter - managedBefore != assets) {
            revert UnsupportedTokenBehavior();
        }
        strategyDebt += assets;
        emit StrategyAllocation(strategy, assets, strategyDebt);
    }

    function recallFromStrategy(uint256 assets) external nonReentrant returns (uint256 received, uint256 loss) {
        if (msg.sender != owner && msg.sender != strategyAdmin && msg.sender != pauseAdmin) revert Forbidden();
        return _recallFromStrategy(assets, maxLossBps, false);
    }

    /// @notice Recovers strategy assets after governance has stopped both deposits and new allocations.
    /// @dev The explicit loss bound prevents an unlimited-loss rescue transaction from being signed accidentally.
    function emergencyRecallFromStrategy(uint256 assets, uint256 emergencyMaxLossBps)
        external onlyOwner nonReentrant returns (uint256 received, uint256 loss)
    {
        if (!depositsPaused || !allocationsPaused) revert EmergencyModeRequired();
        if (emergencyMaxLossBps > BPS) revert InvalidLossLimit();
        return _recallFromStrategy(assets, emergencyMaxLossBps, true);
    }

    function _recallFromStrategy(uint256 assets, uint256 lossLimitBps, bool emergency)
        private returns (uint256 received, uint256 loss)
    {
        if (strategy == address(0)) revert InvalidStrategy();
        if (assets == 0) revert ZeroAmount();
        if (assets > strategyDebt) revert RecallExceedsDebt();
        uint256 managedBefore = ILQCStrategyAdapter(strategy).totalManagedAssets();
        uint256 vaultBefore = idleAssets();
        received = ILQCStrategyAdapter(strategy).withdraw(assets, address(this));
        uint256 managedAfter = ILQCStrategyAdapter(strategy).totalManagedAssets();
        uint256 debtRepaid = managedBefore - managedAfter;
        uint256 balanceReceived = idleAssets() - vaultBefore;
        if (debtRepaid != assets || debtRepaid > strategyDebt ||
            received != balanceReceived || received > debtRepaid) {
            revert UnsupportedTokenBehavior();
        }
        loss = debtRepaid - received;
        if (loss * BPS > debtRepaid * lossLimitBps) revert LossLimitExceeded();

        strategyDebt -= debtRepaid;
        accountedAssets -= loss;
        emit StrategyRecall(strategy, debtRepaid, received, loss);
        if (emergency) emit EmergencyStrategyRecall(strategy, debtRepaid, received, loss);
    }

    function pauseDeposits() external {
        if (msg.sender != owner && msg.sender != pauseAdmin) revert Forbidden();
        depositsPaused = true;
        emit DepositPauseChanged(true, msg.sender);
    }

    function pauseAllocations() external {
        if (msg.sender != owner && msg.sender != pauseAdmin) revert Forbidden();
        allocationsPaused = true;
        emit AllocationPauseChanged(true, msg.sender);
    }

    function resumeAllocations() external onlyOwner {
        allocationsPaused = false;
        emit AllocationPauseChanged(false, msg.sender);
    }

    function resumeDeposits() external onlyOwner {
        if (isInsolvent()) revert Insolvent();
        depositsPaused = false;
        emit DepositPauseChanged(false, msg.sender);
    }

    function setPauseAdmin(address newPauseAdmin) external onlyOwner {
        if (newPauseAdmin == address(0)) revert ZeroAddress();
        address previous = pauseAdmin;
        pauseAdmin = newPauseAdmin;
        emit PauseAdminChanged(previous, newPauseAdmin);
    }

    function setStrategyAdmin(address newStrategyAdmin) external onlyOwner {
        if (newStrategyAdmin == address(0)) revert ZeroAddress();
        address previous = strategyAdmin;
        strategyAdmin = newStrategyAdmin;
        emit StrategyAdminChanged(previous, newStrategyAdmin);
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

    function _withdraw(uint256 assets, uint256 shares, address receiver, address shareOwner) private {
        if (receiver == address(0) || receiver == address(this)) revert ZeroAddress();
        if (assets > accountedIdleAssets() || assets > idleAssets()) revert InsufficientIdleLiquidity();
        if (msg.sender != shareOwner) _spendAllowance(shareOwner, shares);
        _burn(shareOwner, shares);
        accountedAssets -= assets;
        uint256 vaultBefore = IERC20(asset).balanceOf(address(this));
        uint256 receiverBefore = IERC20(asset).balanceOf(receiver);
        asset.safeTransfer(receiver, assets);
        if (vaultBefore - IERC20(asset).balanceOf(address(this)) != assets ||
            IERC20(asset).balanceOf(receiver) - receiverBefore != assets) revert UnsupportedTokenBehavior();
        emit Withdraw(msg.sender, receiver, shareOwner, assets, shares);
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert ZeroAddress();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) private { totalSupply += amount; balanceOf[to] += amount; emit Transfer(address(0), to, amount); }
    function _burn(address from, uint256 amount) private { balanceOf[from] -= amount; totalSupply -= amount; emit Transfer(from, address(0), amount); }

    function _spendAllowance(address from, uint256 amount) private {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) { allowance[from][msg.sender] = allowed - amount; emit Approval(from, msg.sender, allowed - amount); }
    }

    function _ceilDiv(uint256 x, uint256 y) private pure returns (uint256) { return x == 0 ? 0 : (x - 1) / y + 1; }
}
