// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {LQCFlowRouter} from "../LQCFlowRouter.sol";
import {LQCFlowFactory} from "../LQCFlowFactory.sol";
import {LQCFlowPair} from "../LQCFlowPair.sol";
import {LQCFixedPriceSale as Sale} from "./LQCFixedPriceSale.sol";
import {LQCLaunchSaleFactory} from "./LQCLaunchSaleFactory.sol";

/// @notice One-shot liquidity approvals with exact inputs and time-locked LP custody.
contract LQCLaunchLiquidityBootstrap {
    using SafeTransferLib for address;

    bytes32 public constant POLICY = keccak256("LQC_LAUNCH_FLOW_EXACT_LIQUIDITY_LOCK_V1");
    struct Request {
        uint256 project;
        Sale sale;
        LQCFlowRouter router;
        LQCFlowPair pair;
        address paymentToken;
        address projectToken;
        uint112 paymentAmount;
        uint112 projectAmount;
        uint256 minLp;
        address recipient;
        uint64 deadline;
        uint64 unlockAt;
        uint256 nonce;
        bytes32 termsHash;
    }

    struct Lock {
        LQCFlowPair pair;
        address recipient;
        uint64 unlockAt;
        uint256 amount;
    }

    LQCLaunchSaleFactory public immutable sales;
    LQCFlowRouter public immutable router;
    LQCFlowFactory public immutable flowFactory;
    address public immutable reviewer;
    bytes32 public immutable routerHash;
    bytes32 public immutable factoryHash;
    uint64 public immutable minimumLockDuration;

    mapping(Sale => uint256) public lastNonce;
    mapping(bytes32 => Lock) public locks;
    uint256 private unlocked = 1;
    mapping(bytes32 => uint64) public lockedAt;

    error Unauthorized();
    error InvalidRequest();
    error InvalidPool();
    error AccountingMismatch();
    error InsufficientLp();
    error Reentrancy();

    event Approved(bytes32 indexed id, uint256 indexed project, uint256 nonce);
    event Cancelled(bytes32 indexed id);
    event LiquidityAdded(bytes32 indexed id, address indexed pair, uint256 payment, uint256 projectTokens, uint256 lp);
    event LpReleased(bytes32 indexed id, address indexed recipient, uint256 lp);

    constructor(LQCLaunchSaleFactory sales_, LQCFlowRouter router_, uint64 minimumLockDuration_) {
        if (address(sales_).code.length == 0 || address(router_).code.length == 0 ||
            minimumLockDuration_ == 0) revert InvalidRequest();
        sales = sales_;
        router = router_;
        flowFactory = LQCFlowFactory(router_.factory());
        if (address(flowFactory).code.length == 0) revert InvalidPool();
        reviewer = sales_.projectRegistry().reviewer();
        routerHash = address(router_).codehash;
        factoryHash = address(flowFactory).codehash;
        minimumLockDuration = minimumLockDuration_;
    }

    modifier guarded() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    function requestHash(Request calldata request) public view returns (bytes32) {
        return keccak256(abi.encode(POLICY, block.chainid, address(this), address(sales), request));
    }

    function approve(Request calldata request) external guarded returns (bytes32 id) {
        if (msg.sender != reviewer) revert Unauthorized();
        _validate(request);
        if (request.nonce != lastNonce[request.sale] + 1) revert InvalidRequest();
        id = requestHash(request);
        lastNonce[request.sale] = request.nonce;
        request.sale.reserveBootstrap(id, request.paymentAmount);
        emit Approved(id, request.project, request.nonce);
    }

    function cancel(Request calldata request) external guarded {
        bytes32 id = requestHash(request);
        if (request.sale.bootstrapApproval() != id || sales.sales(request.project) != request.sale) {
            revert InvalidRequest();
        }
        if (block.timestamp <= request.deadline && msg.sender != reviewer &&
            msg.sender != request.sale.applicant()) revert Unauthorized();
        request.sale.cancelBootstrap(id);
        emit Cancelled(id);
    }

    function execute(Request calldata request) external guarded returns (uint256 liquidity) {
        _validate(request);
        bytes32 id = requestHash(request);
        address applicant = request.sale.applicant();
        address operator = sales.projectRegistry().saleOperator(request.project);
        if (msg.sender != (operator == address(0) ? applicant : operator)) revert Unauthorized();
        if (request.sale.bootstrapApproval() != id || request.sale.bootstrapReserved() != request.paymentAmount) {
            revert InvalidRequest();
        }
        liquidity = _supply(request, id, applicant);
        lockedAt[id] = uint64(block.timestamp);
        locks[id] = Lock(request.pair, request.recipient, request.unlockAt, liquidity);
        emit LiquidityAdded(id, address(request.pair), request.paymentAmount, request.projectAmount, liquidity);
    }

    function release(bytes32 id) external guarded {
        Lock storage entry = locks[id];
        if (msg.sender != entry.recipient) revert Unauthorized();
        uint256 amount = entry.amount;
        if (amount == 0 || block.timestamp < entry.unlockAt) revert InvalidRequest();
        entry.amount = 0;
        address(entry.pair).safeTransfer(entry.recipient, amount);
        emit LpReleased(id, entry.recipient, amount);
    }

    function _validate(Request calldata request) private view {
        if (sales.sales(request.project) != request.sale || address(request.sale) == address(0) ||
            request.sale.termsHash() != request.termsHash || request.router != router ||
            request.deadline < block.timestamp || uint256(request.deadline) + minimumLockDuration > request.unlockAt ||
            request.paymentAmount == 0 || request.projectAmount == 0 || request.minLp == 0 ||
            request.recipient == address(0) || request.recipient == address(this) || request.recipient == address(request.pair)) {
            revert InvalidRequest();
        }
        (address projectToken, address paymentToken,,,,,,,) = request.sale.terms();
        if (request.paymentToken != paymentToken || request.projectToken != projectToken ||
            !sales.allowedToken(paymentToken) || !sales.allowedToken(projectToken)) revert InvalidRequest();
        if (address(router).codehash != routerHash || address(flowFactory).codehash != factoryHash ||
            address(request.pair).code.length == 0 ||
            flowFactory.getPair(paymentToken, projectToken) != address(request.pair) ||
            request.pair.factory() != address(flowFactory)) revert InvalidPool();
    }

    function _supply(Request calldata request, bytes32 id, address applicant) private returns (uint256 liquidity) {
        IERC20 payment = IERC20(request.paymentToken);
        IERC20 project = IERC20(request.projectToken);
        address pair = address(request.pair);
        (uint256 paymentReserve, uint256 projectReserve) = _reserves(request);
        // Empty pools start at the ratio bound by the reviewed request. Existing pools
        // must accept both exact inputs at their current reserve ratio.
        if (request.paymentAmount * projectReserve != request.projectAmount * paymentReserve) revert InvalidPool();
        if (payment.balanceOf(pair) != paymentReserve || project.balanceOf(pair) != projectReserve) {
            revert AccountingMismatch();
        }

        uint256 paymentBefore = payment.balanceOf(address(this));
        uint256 projectBefore = project.balanceOf(address(this));
        uint256 applicantBefore = project.balanceOf(applicant);
        uint256 lpBefore = request.pair.balanceOf(address(this));
        request.sale.spendBootstrap(id);
        request.projectToken.safeTransferFrom(applicant, address(this), request.projectAmount);
        if (payment.balanceOf(address(this)) != paymentBefore + request.paymentAmount ||
            project.balanceOf(address(this)) != projectBefore + request.projectAmount ||
            project.balanceOf(applicant) != applicantBefore - request.projectAmount) revert AccountingMismatch();

        request.paymentToken.forceApprove(address(router), request.paymentAmount);
        request.projectToken.forceApprove(address(router), request.projectAmount);
        (uint256 usedPayment, uint256 usedProject, uint256 minted) = router.addLiquidity(
            request.paymentToken, request.projectToken, request.paymentAmount, request.projectAmount,
            request.paymentAmount, request.projectAmount, address(this), request.deadline
        );
        if (minted < request.minLp) revert InsufficientLp();
        request.paymentToken.forceApprove(address(router), 0);
        request.projectToken.forceApprove(address(router), 0);
        (uint256 newPaymentReserve, uint256 newProjectReserve) = _reserves(request);
        if (usedPayment != request.paymentAmount || usedProject != request.projectAmount ||
            payment.balanceOf(address(this)) != paymentBefore || project.balanceOf(address(this)) != projectBefore ||
            newPaymentReserve != paymentReserve + usedPayment || newProjectReserve != projectReserve + usedProject ||
            payment.balanceOf(pair) != newPaymentReserve || project.balanceOf(pair) != newProjectReserve ||
            request.pair.balanceOf(address(this)) != lpBefore + minted) revert AccountingMismatch();
        return minted;
    }

    function _reserves(Request calldata request) private view returns (uint256 payment, uint256 project) {
        (uint112 r0, uint112 r1,) = request.pair.getReserves();
        return request.pair.token0() == request.paymentToken ? (r0, r1) : (r1, r0);
    }
}
