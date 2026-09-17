// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IERC20CompositeVaultBalance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILQCLiquidityVaultDeposit {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
}

/// @notice Reviewed Composite Action adapter for one exact LQC Liquidity Vault.
contract LQCCompositeVaultAdapter {
    using SafeTransferLib for address;

    address public immutable executor;
    address public immutable vault;
    address public immutable asset;

    error Unauthorized();
    error InvalidAction();
    error InsufficientOutput();
    error ResidualAsset();

    constructor(address executor_, address vault_) {
        if (executor_ == address(0) || vault_ == address(0) || vault_.code.length == 0) revert InvalidAction();
        executor = executor_;
        vault = vault_;
        asset = ILQCLiquidityVaultDeposit(vault_).asset();
        if (asset == address(0) || asset.code.length == 0) revert InvalidAction();
    }

    function execute(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata data)
        external
        returns (uint256 amountOut)
    {
        if (msg.sender != executor) revert Unauthorized();
        if (tokenIn != asset || tokenOut != vault || amountIn == 0 || minAmountOut == 0 || data.length != 0) {
            revert InvalidAction();
        }
        uint256 beforeShares = IERC20CompositeVaultBalance(vault).balanceOf(executor);
        tokenIn.safeTransferFrom(executor, address(this), amountIn);
        tokenIn.forceApprove(vault, amountIn);
        uint256 reported = ILQCLiquidityVaultDeposit(vault).deposit(amountIn, executor);
        tokenIn.forceApprove(vault, 0);
        amountOut = IERC20CompositeVaultBalance(vault).balanceOf(executor) - beforeShares;
        if (amountOut != reported) revert InvalidAction();
        if (amountOut < minAmountOut) revert InsufficientOutput();
        if (IERC20CompositeVaultBalance(tokenIn).balanceOf(address(this)) != 0) revert ResidualAsset();
    }
}
