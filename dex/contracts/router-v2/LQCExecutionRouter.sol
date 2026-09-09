// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCDexRegistry} from "./interfaces/ILQCDexRegistry.sol";
import {ILQCExecutionAdapter} from "./interfaces/ILQCExecutionAdapter.sol";
import {ILQCDexAdapter} from "./interfaces/ILQCDexAdapter.sol";
import {ILQCRiskRegistry} from "./interfaces/ILQCRiskRegistry.sol";

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Executes an exact-input swap only through an enabled, reviewed registry adapter.
/// @dev Token-only MVP. Native BNB and fee-on-transfer tokens remain intentionally unsupported.
contract LQCExecutionRouter {
    using SafeTransferLib for address;

    uint256 public constant MAX_SPLIT_ROUTES = 4;
    ILQCDexRegistry public immutable registry;
    ILQCRiskRegistry public immutable riskRegistry;
    uint256 private unlocked = 1;

    event SwapExecuted(
        address indexed sender,
        bytes32 indexed dexId,
        address indexed recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    error ZeroAddress();
    error InvalidTokens();
    error InvalidAmount();
    error Expired();
    error DexDisabled();
    error InsufficientOutput();
    error UnsupportedToken();
    error Reentrancy();
    error NoExecutableRoute();
    error InvalidRouteData();
    error InvalidSplit();
    error DuplicateDex();

    struct SplitRoute {
        bytes32 dexId;
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes routeData;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address registry_, address riskRegistry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = ILQCDexRegistry(registry_);
        riskRegistry = ILQCRiskRegistry(riskRegistry_);
    }

    function swapExactInput(
        bytes32 dexId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external nonReentrant returns (uint256 amountOut) {
        _consumeSingle(tokenIn, tokenOut, dexId, amountIn);
        amountOut = _execute(
            dexId, tokenIn, tokenOut, amountIn, amountOutMinimum, recipient, deadline, routeData
        );
    }

    /// @notice Selects and atomically executes the best enabled route after route-cost adjustment.
    /// @dev routeData and routeCostInTokenOut are aligned with the registry order. Costs are
    ///      off-chain gas estimates denominated in tokenOut; callers may pass zero for each route.
    function swapBestExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes[] calldata routeData,
        uint256[] calldata routeCostInTokenOut
    ) external nonReentrant returns (bytes32 dexId, uint256 amountOut) {
        if (block.timestamp > deadline) revert Expired();
        uint256 count = registry.dexCount();
        if (routeData.length != count || routeCostInTokenOut.length != count) revert InvalidRouteData();

        uint256 bestNetOutput;
        uint32 bestPriority;
        uint256 bestIndex;
        bool found;
        for (uint256 i; i < count; ++i) {
            bytes32 candidateId = registry.dexIdAt(i);
            (address adapter, bool enabled, uint32 priority) = registry.getDex(candidateId);
            if (!enabled || adapter == address(0) || !_supportsExecution(adapter)) continue;
            try ILQCDexAdapter(adapter).quoteExactInput(tokenIn, tokenOut, amountIn, routeData[i])
                returns (uint256 grossOutput)
            {
                uint256 cost = routeCostInTokenOut[i];
                if (grossOutput <= cost) continue;
                uint256 netOutput = grossOutput - cost;
                if (!found || netOutput > bestNetOutput || (netOutput == bestNetOutput && priority > bestPriority)) {
                    found = true;
                    dexId = candidateId;
                    bestNetOutput = netOutput;
                    bestPriority = priority;
                    bestIndex = i;
                }
            } catch {
                // One malformed or unavailable route must not block other registered DEXs.
            }
        }
        if (!found) revert NoExecutableRoute();
        _consumeSingle(tokenIn, tokenOut, dexId, amountIn);
        amountOut = _execute(
            dexId, tokenIn, tokenOut, amountIn, amountOutMinimum, recipient, deadline, routeData[bestIndex]
        );
    }

    /// @notice Atomically divides one exact-input order across reviewed DEX routes.
    /// @dev The caller or off-chain optimizer supplies allocations. Every leg and the aggregate
    ///      output are protected; failure in any leg reverts the complete split order.
    function swapSplitExactInput(
        address tokenIn,
        address tokenOut,
        uint256 totalAmountIn,
        uint256 totalAmountOutMinimum,
        address recipient,
        uint256 deadline,
        SplitRoute[] calldata routes
    ) external nonReentrant returns (uint256 totalAmountOut) {
        uint256 length = routes.length;
        if (length < 2 || length > MAX_SPLIT_ROUTES) revert InvalidSplit();
        if (totalAmountIn == 0 || totalAmountOutMinimum == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert Expired();

        uint256 allocated;
        for (uint256 i; i < length; ++i) {
            SplitRoute calldata route = routes[i];
            if (route.amountIn == 0 || route.amountOutMinimum == 0) revert InvalidSplit();
            for (uint256 j; j < i; ++j) {
                if (routes[j].dexId == route.dexId) revert DuplicateDex();
            }
            allocated += route.amountIn;
        }
        if (allocated != totalAmountIn) revert InvalidSplit();

        bytes32[] memory dexIds = new bytes32[](length);
        uint256[] memory amountsIn = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            dexIds[i] = routes[i].dexId;
            amountsIn[i] = routes[i].amountIn;
        }
        _consume(tokenIn, tokenOut, dexIds, amountsIn);

        for (uint256 i; i < length; ++i) {
            SplitRoute calldata route = routes[i];
            totalAmountOut += _execute(
                route.dexId,
                tokenIn,
                tokenOut,
                route.amountIn,
                route.amountOutMinimum,
                recipient,
                deadline,
                route.routeData
            );
        }
        if (totalAmountOut < totalAmountOutMinimum) revert InsufficientOutput();
    }

    function _execute(
        bytes32 dexId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) private returns (uint256 amountOut) {
        if (tokenIn == address(0) || tokenOut == address(0) || recipient == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert InvalidTokens();
        if (amountIn == 0 || amountOutMinimum == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert Expired();

        (address adapter, bool enabled,) = registry.getDex(dexId);
        if (!enabled || adapter == address(0) || !_supportsExecution(adapter)) revert DexDisabled();

        uint256 routerBefore = IERC20Balance(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20Balance(tokenIn).balanceOf(address(this)) - routerBefore != amountIn) revert UnsupportedToken();

        uint256 recipientBefore = IERC20Balance(tokenOut).balanceOf(recipient);
        tokenIn.forceApprove(adapter, amountIn);
        ILQCExecutionAdapter(adapter).executeExactInput(
            tokenIn, tokenOut, amountIn, amountOutMinimum, recipient, deadline, routeData
        );
        tokenIn.forceApprove(adapter, 0);

        amountOut = IERC20Balance(tokenOut).balanceOf(recipient) - recipientBefore;
        if (amountOut < amountOutMinimum) revert InsufficientOutput();
        if (IERC20Balance(tokenIn).balanceOf(address(this)) != routerBefore) revert UnsupportedToken();

        emit SwapExecuted(msg.sender, dexId, recipient, tokenIn, tokenOut, amountIn, amountOut);
    }

    function _supportsExecution(address adapter) private pure returns (bool supported) {
        try ILQCExecutionAdapter(adapter).supportsExecution() returns (bool value) {
            supported = value;
        } catch {
            supported = false;
        }
    }

    function _consumeSingle(address tokenIn, address tokenOut, bytes32 dexId, uint256 amountIn) private {
        bytes32[] memory dexIds = new bytes32[](1);
        uint256[] memory amountsIn = new uint256[](1);
        dexIds[0] = dexId;
        amountsIn[0] = amountIn;
        _consume(tokenIn, tokenOut, dexIds, amountsIn);
    }

    function _consume(address tokenIn, address tokenOut, bytes32[] memory dexIds, uint256[] memory amountsIn) private {
        if (address(riskRegistry) != address(0)) riskRegistry.consumeSwap(tokenIn, tokenOut, dexIds, amountsIn);
    }
}
