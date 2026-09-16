// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {LQCCompositePlan} from "./LQCCompositePlan.sol";
import {LQCCompositeAdapterRegistry} from "./LQCCompositeAdapterRegistry.sol";
import {LQCCompositeExecutor} from "./LQCCompositeExecutor.sol";

interface IERC20CompositeCoordinatorBalance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILQCIntentHubCompositeRole {
    function acceptInternalSolver() external;
}

/// @notice IntentHub-compatible Internal Solver that coordinates one committed Composite plan.
/// @dev routeData = abi.encode(LQCCompositePlan.Action[] actions, bytes[] payloads).
///      The existing Hub and Escrow stay unchanged: their release, this execution and the Hub's
///      final receipt update all occur in one transaction and therefore revert atomically.
contract LQCCompositeCoordinator {
    using SafeTransferLib for address;

    bytes32 public constant COMPOSITE_DEX_ID = keccak256("LQC_COMPOSITE_V1");

    address public immutable intentHub;
    address public immutable administrator;
    LQCCompositeExecutor public immutable executor;
    address public immutable executionRouter;
    uint256 private unlocked = 1;

    event CompositeIntentCoordinated(
        bytes32 indexed intentHash,
        bytes32 indexed planHash,
        address indexed recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    error Unauthorized();
    error ZeroAddress();
    error InvalidExecution();
    error InvalidRoute();
    error ResidualToken();
    error Reentrancy();

    modifier onlyHub() {
        if (msg.sender != intentHub) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address intentHub_, address planValidator_, address adapterRegistry_, address administrator_) {
        if (
            intentHub_ == address(0) || planValidator_ == address(0) || adapterRegistry_ == address(0)
                || administrator_ == address(0)
        ) revert ZeroAddress();
        if (intentHub_.code.length == 0 || planValidator_.code.length == 0 || adapterRegistry_.code.length == 0) {
            revert InvalidExecution();
        }
        intentHub = intentHub_;
        administrator = administrator_;
        executor = new LQCCompositeExecutor(address(this), planValidator_, adapterRegistry_);
        executionRouter = address(executor);
    }

    function acceptHubRole() external {
        if (msg.sender != administrator) revert Unauthorized();
        ILQCIntentHubCompositeRole(intentHub).acceptInternalSolver();
    }

    function executeExactInput(
        bytes32 intentHash,
        bytes32 dexId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external onlyHub nonReentrant returns (uint256 amountOut) {
        if (
            intentHash == bytes32(0) || dexId != COMPOSITE_DEX_ID || tokenIn == address(0)
                || tokenOut == address(0) || recipient == address(0) || recipient == address(this)
                || recipient == address(executor) || amountIn == 0 || amountOutMinimum == 0 || deadline < block.timestamp
        ) revert InvalidExecution();
        if (routeData.length == 0) revert InvalidRoute();
        if (IERC20CompositeCoordinatorBalance(tokenIn).balanceOf(address(this)) != amountIn) revert ResidualToken();

        (LQCCompositePlan.Action[] memory actions, bytes[] memory payloads) =
            abi.decode(routeData, (LQCCompositePlan.Action[], bytes[]));
        if (actions.length != payloads.length) revert InvalidRoute();

        tokenIn.safeTransfer(address(executor), amountIn);
        bytes32 planHash;
        (planHash, amountOut) = executor.execute(
            intentHash,
            tokenIn,
            amountIn,
            tokenOut,
            recipient,
            amountOutMinimum,
            deadline,
            actions,
            payloads
        );
        if (amountOut < amountOutMinimum) revert InvalidExecution();
        if (
            IERC20CompositeCoordinatorBalance(tokenIn).balanceOf(address(this)) != 0
                || IERC20CompositeCoordinatorBalance(tokenOut).balanceOf(address(this)) != 0
        ) revert ResidualToken();

        emit CompositeIntentCoordinated(
            intentHash, planHash, recipient, tokenIn, tokenOut, amountIn, amountOut
        );
    }
}
