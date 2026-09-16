// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IERC20CompositeLendingBalance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILQCCompositeLendingMarkets {
    struct MarketConfig {
        address collateralAsset;
        address debtAsset;
        uint8 collateralDecimals;
        uint8 debtDecimals;
        uint16 maxLtvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint128 supplyCap;
        uint128 borrowCap;
        uint128 minBorrow;
        bool enabled;
    }

    function getMarket(bytes32 id) external view returns (MarketConfig memory);
}

interface ILQCCompositeLendingCore {
    function registry() external view returns (address);
    function supplyLiquidity(bytes32 id, uint256 amount) external;
    function withdrawLiquidity(bytes32 id, uint256 amount, address receiver) external;
    function liquidityOf(bytes32 id, address account) external view returns (uint256);
}

/// @notice Market-specific, transferable receipt adapter for Composite Lending supply actions.
/// @dev data = abi.encode(bytes32 marketId). The adapter is pinned to one Core and one market,
///      so the same audited bytecode can be deployed with chain-specific constructor bindings.
contract LQCCompositeLendingSupplyAdapter {
    using SafeTransferLib for address;

    string public name;
    string public symbol;
    uint8 public immutable decimals;
    address public immutable executor;
    ILQCCompositeLendingCore public immutable lendingCore;
    bytes32 public immutable marketId;
    address public immutable asset;

    uint256 public totalSupply;
    mapping(address account => uint256) public balanceOf;
    mapping(address owner => mapping(address spender => uint256)) public allowance;
    uint256 private unlocked = 1;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event LendingSupplied(address indexed executor, uint256 assets, uint256 receipts);
    event LendingRedeemed(address indexed account, address indexed receiver, uint256 receipts, uint256 assets);

    error Unauthorized();
    error InvalidAction();
    error InsufficientOutput();
    error InsufficientBalance();
    error InsufficientAllowance();
    error BalanceMismatch();
    error Reentrancy();

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        address executor_,
        address lendingCore_,
        bytes32 marketId_,
        string memory name_,
        string memory symbol_
    ) {
        if (
            executor_ == address(0) || lendingCore_ == address(0) || lendingCore_.code.length == 0
                || marketId_ == bytes32(0) || bytes(name_).length == 0 || bytes(symbol_).length == 0
        ) revert InvalidAction();
        executor = executor_;
        lendingCore = ILQCCompositeLendingCore(lendingCore_);
        marketId = marketId_;
        address registry_ = ILQCCompositeLendingCore(lendingCore_).registry();
        if (registry_ == address(0) || registry_.code.length == 0) revert InvalidAction();
        ILQCCompositeLendingMarkets.MarketConfig memory config =
            ILQCCompositeLendingMarkets(registry_).getMarket(marketId_);
        if (config.debtAsset == address(0) || config.debtAsset.code.length == 0) revert InvalidAction();
        asset = config.debtAsset;
        decimals = config.debtDecimals;
        name = name_;
        symbol = symbol_;
    }

    function totalAssets() public view returns (uint256) {
        return lendingCore.liquidityOf(marketId, address(this));
    }

    function execute(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata data)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (msg.sender != executor) revert Unauthorized();
        if (
            tokenIn != asset || tokenOut != address(this) || amountIn == 0 || minAmountOut == 0 || data.length != 32
                || abi.decode(data, (bytes32)) != marketId
        ) revert InvalidAction();

        uint256 assetsBefore = totalAssets();
        uint256 receiptsBefore = totalSupply;
        if ((assetsBefore == 0) != (receiptsBefore == 0)) revert BalanceMismatch();
        uint256 idleBefore = IERC20CompositeLendingBalance(asset).balanceOf(address(this));
        asset.safeTransferFrom(executor, address(this), amountIn);
        if (IERC20CompositeLendingBalance(asset).balanceOf(address(this)) != idleBefore + amountIn) {
            revert BalanceMismatch();
        }
        asset.forceApprove(address(lendingCore), amountIn);
        lendingCore.supplyLiquidity(marketId, amountIn);
        asset.forceApprove(address(lendingCore), 0);
        if (IERC20CompositeLendingBalance(asset).balanceOf(address(this)) != idleBefore) revert BalanceMismatch();

        uint256 assetsAfter = totalAssets();
        if (assetsAfter <= assetsBefore) revert BalanceMismatch();
        uint256 supplied = assetsAfter - assetsBefore;
        amountOut = receiptsBefore == 0 ? supplied : supplied * receiptsBefore / assetsBefore;
        if (amountOut < minAmountOut || amountOut == 0) revert InsufficientOutput();
        _mint(executor, amountOut);
        emit LendingSupplied(executor, supplied, amountOut);
    }

    function redeem(uint256 receipts, address receiver) external nonReentrant returns (uint256 assets) {
        if (receipts == 0 || receiver == address(0)) revert InvalidAction();
        uint256 supply = totalSupply;
        if (receipts > balanceOf[msg.sender] || supply == 0) revert InsufficientBalance();
        assets = receipts * totalAssets() / supply;
        if (assets == 0) revert InvalidAction();
        _burn(msg.sender, receipts);
        lendingCore.withdrawLiquidity(marketId, assets, receiver);
        emit LendingRedeemed(msg.sender, receiver, receipts, assets);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (amount > allowed) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowed - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidAction();
        if (amount > balanceOf[from]) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) private {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
