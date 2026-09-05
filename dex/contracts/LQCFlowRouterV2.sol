// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {ILQCDEXAdapter} from "./interfaces/ILQCDEXAdapter.sol";
import {IWBNB} from "./interfaces/IWBNB.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";

/// @notice Adapter-based best-price router across approved DEX integrations.
contract LQCFlowRouterV2 {
    using SafeTransferLib for address;

    uint256 public constant MAX_CANDIDATES = 16;

    address public immutable WBNB;
    address public owner;
    address public pendingOwner;
    mapping(address => bool) public isAdapterEnabled;
    uint256 private unlocked = 1;

    event AdapterStatusChanged(address indexed adapter, bool enabled);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BestRouteSwap(
        address indexed sender,
        address indexed recipient,
        address indexed adapter,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    error Forbidden();
    error ZeroAddress();
    error InvalidTokens();
    error InvalidAmount();
    error InvalidCandidates();
    error AdapterNotEnabled();
    error NoViableQuote();
    error Expired();
    error InsufficientOutput();
    error Reentrancy();
    error NativeSenderNotWBNB();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address owner_, address wbnb_) {
        if (owner_ == address(0) || wbnb_ == address(0)) revert ZeroAddress();
        owner = owner_;
        WBNB = wbnb_;
        emit OwnershipTransferred(address(0), owner_);
    }

    receive() external payable {
        if (msg.sender != WBNB) revert NativeSenderNotWBNB();
    }

    function setAdapter(address adapter, bool enabled) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        isAdapterEnabled[adapter] = enabled;
        emit AdapterStatusChanged(adapter, enabled);
    }

    function transferOwnership(address newOwner) external onlyOwner {
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

    function getBestQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address[] calldata adapters,
        bytes[] calldata routeData
    ) public view returns (uint256 bestIndex, address bestAdapter, uint256 amountOut) {
        _validateRequest(tokenIn, tokenOut, amountIn, adapters, routeData);

        for (uint256 i; i < adapters.length; ++i) {
            address adapter = adapters[i];
            if (!isAdapterEnabled[adapter]) continue;
            try ILQCDEXAdapter(adapter).quoteExactInput(tokenIn, tokenOut, amountIn, routeData[i])
                returns (uint256 quotedOut)
            {
                if (quotedOut > amountOut) {
                    bestIndex = i;
                    bestAdapter = adapter;
                    amountOut = quotedOut;
                }
            } catch {}
        }

        if (bestAdapter == address(0) || amountOut == 0) revert NoViableQuote();
    }

    function swapBestExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata adapters,
        bytes[] calldata routeData,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (address adapter, uint256 amountOut) {
        if (deadline < block.timestamp) revert Expired();
        if (recipient == address(0)) revert ZeroAddress();

        (uint256 bestIndex, address bestAdapter,) = getBestQuote(tokenIn, tokenOut, amountIn, adapters, routeData);
        uint256 inputBalanceFloor = IERC20(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = _executeFunded(
            tokenIn, tokenOut, amountIn, amountOutMin, bestAdapter, routeData[bestIndex]
        );
        uint256 unusedInput = IERC20(tokenIn).balanceOf(address(this)) - inputBalanceFloor;
        if (unusedInput > 0) tokenIn.safeTransfer(msg.sender, unusedInput);
        tokenOut.safeTransfer(recipient, amountOut);

        emit BestRouteSwap(msg.sender, recipient, bestAdapter, tokenIn, tokenOut, amountIn, amountOut);
        return (bestAdapter, amountOut);
    }

    function swapExactBNBForTokens(
        address tokenOut,
        uint256 amountOutMin,
        address[] calldata adapters,
        bytes[] calldata routeData,
        address recipient,
        uint256 deadline
    ) external payable nonReentrant returns (address adapter, uint256 amountOut) {
        if (deadline < block.timestamp) revert Expired();
        if (recipient == address(0)) revert ZeroAddress();

        (uint256 bestIndex, address bestAdapter,) = getBestQuote(WBNB, tokenOut, msg.value, adapters, routeData);
        uint256 inputBalanceFloor = IERC20(WBNB).balanceOf(address(this));
        IWBNB(WBNB).deposit{value: msg.value}();
        amountOut = _executeFunded(
            WBNB, tokenOut, msg.value, amountOutMin, bestAdapter, routeData[bestIndex]
        );
        uint256 unusedInput = IERC20(WBNB).balanceOf(address(this)) - inputBalanceFloor;
        if (unusedInput > 0) {
            IWBNB(WBNB).withdraw(unusedInput);
            SafeTransferLib.safeTransferBNB(msg.sender, unusedInput);
        }
        tokenOut.safeTransfer(recipient, amountOut);

        emit BestRouteSwap(msg.sender, recipient, bestAdapter, WBNB, tokenOut, msg.value, amountOut);
        return (bestAdapter, amountOut);
    }

    function swapExactTokensForBNB(
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata adapters,
        bytes[] calldata routeData,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (address adapter, uint256 amountOut) {
        if (deadline < block.timestamp) revert Expired();
        if (recipient == address(0)) revert ZeroAddress();

        (uint256 bestIndex, address bestAdapter,) = getBestQuote(tokenIn, WBNB, amountIn, adapters, routeData);
        uint256 inputBalanceFloor = IERC20(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = _executeFunded(
            tokenIn, WBNB, amountIn, amountOutMin, bestAdapter, routeData[bestIndex]
        );
        uint256 unusedInput = IERC20(tokenIn).balanceOf(address(this)) - inputBalanceFloor;
        if (unusedInput > 0) tokenIn.safeTransfer(msg.sender, unusedInput);
        IWBNB(WBNB).withdraw(amountOut);
        SafeTransferLib.safeTransferBNB(recipient, amountOut);

        emit BestRouteSwap(msg.sender, recipient, bestAdapter, tokenIn, WBNB, amountIn, amountOut);
        return (bestAdapter, amountOut);
    }

    function _executeFunded(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address bestAdapter,
        bytes calldata routeData
    ) private returns (uint256 amountOut) {
        if (!isAdapterEnabled[bestAdapter]) revert AdapterNotEnabled();
        _forceApprove(tokenIn, bestAdapter, amountIn);
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        ILQCDEXAdapter(bestAdapter).swapExactInput(
            tokenIn, tokenOut, amountIn, amountOutMin, address(this), routeData
        );
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - balanceBefore;
        _forceApprove(tokenIn, bestAdapter, 0);
        if (amountOut < amountOutMin) revert InsufficientOutput();
    }

    function _validateRequest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address[] calldata adapters,
        bytes[] calldata routeData
    ) private pure {
        if (tokenIn == address(0) || tokenOut == address(0) || tokenIn == tokenOut) revert InvalidTokens();
        if (amountIn == 0) revert InvalidAmount();
        if (adapters.length == 0 || adapters.length > MAX_CANDIDATES || adapters.length != routeData.length) {
            revert InvalidCandidates();
        }
    }

    function _forceApprove(address token, address spender, uint256 amount) private {
        (bool cleared, bytes memory clearData) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, 0)
        );
        if (!cleared || (clearData.length != 0 && !abi.decode(clearData, (bool)))) revert Forbidden();
        if (amount == 0) return;
        (bool approved, bytes memory approveData) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        if (!approved || (approveData.length != 0 && !abi.decode(approveData, (bool)))) revert Forbidden();
    }
}
