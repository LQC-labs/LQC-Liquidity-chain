// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCSignedIntentHub as Hub} from "./LQCSignedIntentHub.sol";
import {ILQCInternalSolverIntent} from "./LQCIntentSolverBinding.sol";
import {LQCSolverBondVault} from "./LQCSolverBondVault.sol";
import {LQCSolverReputation} from "./LQCSolverReputation.sol";
import {LQCSolverRegistry} from "./LQCSolverRegistry.sol";
import {LQCSolverAssignment} from "./LQCSolverAssignment.sol";
import {LQCExecutionRouter} from "../router-v2/LQCExecutionRouter.sol";
import {LQCRiskRegistry} from "../router-v2/LQCRiskRegistry.sol";
import {ILQCDexAdapter} from "../router-v2/interfaces/ILQCDexAdapter.sol";
import {ILQCExecutionAdapter} from "../router-v2/interfaces/ILQCExecutionAdapter.sol";

/// @notice Bounded same-chain competition for one signed settlement. Solvers pay their own gas.
contract LQCSolverQuoteBook {
    uint256 public constant MAX_BIDDERS = 8;
    uint256 public constant MAX_ROUTE_BYTES = 512;

    enum Phase { Missing, Open, AwaitingSelection, Selected, Cancelled, Expired, Settled, NonceUsed }

    struct Request {
        address user;
        address tokenIn;
        address tokenOut;
        address recipient;
        uint256 nonce;
        uint256 amountIn;
        uint256 minimum;
        uint256 close;
        uint256 deadline;
    }

    struct Bid {
        bytes32 dexId;
        address adapter;
        uint256 guaranteedOut;
        uint256 solverFee;
        uint256 expiry;
        bytes routeData;
    }

    Hub public immutable hub;
    LQCSolverRegistry public immutable registry;
    LQCSolverAssignment public immutable assignments;
    LQCSolverBondVault public immutable vault;
    LQCSolverReputation public immutable reputation;
    LQCExecutionRouter public immutable router;
    LQCRiskRegistry public immutable risk;
    address public immutable stablecoin;

    mapping(bytes32 => Request) private requests;
    mapping(bytes32 => mapping(address => Bid)) private bids;
    mapping(bytes32 => address[]) private bidders;
    mapping(bytes32 => bytes32) public selectedIntent;
    mapping(bytes32 => bytes32) public requestForIntent;

    mapping(bytes32 => bool) public cancelled;
    mapping(bytes32 => bytes32) public retryFor;
    mapping(bytes32 => bytes32) public previousRequest;

    mapping(bytes32 => bytes32) public requestEpoch;

    error UnauthorizedUser();
    error InvalidConfiguration();
    error InvalidRequest();
    error InvalidBid();
    error BiddingClosed();
    error AlreadyBid();
    error IneligibleQuote();
    error TooManyBidders();
    error SelectionUnavailable();
    error InvalidSelection();

    event RequestCancelled(bytes32 indexed requestId);
    event RequestRetried(bytes32 indexed previousId, bytes32 indexed newId);
    event RequestOpened(bytes32 indexed requestId, address indexed user);
    event BidSubmitted(bytes32 indexed requestId, address indexed solver, uint256 guaranteedOut, uint256 expiry);
    event BidWithdrawn(bytes32 indexed requestId, address indexed solver);
    event WinnerSelected(bytes32 indexed requestId, bytes32 indexed intentHash, address indexed solver,
        bytes32 quoteHash, uint256 netOut);

    constructor(Hub hub_, LQCSolverRegistry registry_, LQCSolverAssignment assignments_,
        LQCSolverBondVault vault_, LQCSolverReputation reputation_, LQCExecutionRouter router_)
    {
        address stable = vault_.stablecoin();
        if (stable != address(registry_.bondToken()) || address(reputation_.registry()) != address(registry_)) {
            revert InvalidConfiguration();
        }
        hub = hub_;
        registry = registry_;
        assignments = assignments_;
        vault = vault_;
        reputation = reputation_;
        router = router_;
        risk = LQCRiskRegistry(address(router_.riskRegistry()));
        stablecoin = stable;
    }

    function open(Request calldata request) external returns (bytes32 id) {
        if (hub.executionPaused() || msg.sender != request.user || request.tokenIn != stablecoin || request.tokenOut == stablecoin ||
            request.tokenOut.code.length == 0 || request.recipient == address(0) || request.amountIn == 0 ||
            request.minimum == 0 || request.close <= block.timestamp || request.close >= request.deadline ||
            hub.escrow().intentForNonce(request.user, request.nonce) != bytes32(0)) revert InvalidRequest();
        id = keccak256(abi.encode(block.chainid, address(this), request));
        if (requests[id].user != address(0)) revert InvalidRequest();
        requests[id] = request;
        requestEpoch[id] = hub.executionEpoch();
        emit RequestOpened(id, msg.sender);
    }

    function phase(bytes32 id) public view returns (Phase) {
        Request storage request = requests[id];
        if (request.user == address(0)) return Phase.Missing;
        bytes32 intent = selectedIntent[id];
        bytes32 nonceIntent = hub.escrow().intentForNonce(request.user, request.nonce);
        if (nonceIntent != bytes32(0)) {
            return nonceIntent == intent && hub.settlements(intent) != bytes32(0) ? Phase.Settled : Phase.NonceUsed;
        }
        if (cancelled[id]) return Phase.Cancelled;
        if (block.timestamp >= request.deadline || requestEpoch[id] != hub.executionEpoch()) return Phase.Expired;
        if (intent != bytes32(0)) {
            (,,, uint256 expiry,) = assignments.assignments(intent);
            return block.timestamp >= expiry ? Phase.Expired : Phase.Selected;
        }
        return block.timestamp < request.close ? Phase.Open : Phase.AwaitingSelection;
    }

    function cancel(bytes32 id) external {
        if (msg.sender != requests[id].user) revert UnauthorizedUser();
        Phase status = phase(id);
        if (status != Phase.Open && status != Phase.AwaitingSelection && status != Phase.Selected && status != Phase.Expired) {
            revert InvalidRequest();
        }
        cancelled[id] = true;
        emit RequestCancelled(id);
    }

    /// @notice Starts a new competition with the same user, assets, input, minimum, recipient, nonce and deadline.
    /// @dev Old assignments are kept for evidence. They cannot execute, and the next winner needs a new signature.
    function retry(bytes32 id, uint256 close) external returns (bytes32 next) {
        Request memory request = requests[id];
        if (msg.sender != request.user) revert UnauthorizedUser();
        Phase status = phase(id);
        if (hub.executionPaused() || (status != Phase.Cancelled && status != Phase.Expired) || retryFor[id] != bytes32(0) ||
            close <= block.timestamp || close >= request.deadline) revert InvalidRequest();
        request.close = close;
        next = keccak256(abi.encode(block.chainid, address(this), id, request));
        requests[next] = request;
        requestEpoch[next] = hub.executionEpoch();
        retryFor[id] = next;
        previousRequest[next] = id;
        emit RequestOpened(next, msg.sender);
        emit RequestRetried(id, next);
    }

    function requestDetails(bytes32 id) external view returns (Request memory) { return requests[id]; }

    function bidderCount(bytes32 id) external view returns (uint256) { return bidders[id].length; }

    function bidAt(bytes32 id, uint256 position) external view returns (address solver, Bid memory bid) {
        solver = bidders[id][position];
        bid = bids[id][solver];
    }

    function submit(bytes32 id, Bid calldata bid) external {
        if (hub.executionPaused()) revert SelectionUnavailable();
        Request storage request = requests[id];
        if (phase(id) != Phase.Open) revert BiddingClosed();
        if (bid.solverFee != 0 || bid.guaranteedOut < request.minimum || bid.expiry <= request.close ||
            bid.expiry > request.deadline || bid.routeData.length == 0 || bid.routeData.length > MAX_ROUTE_BYTES) {
            revert InvalidBid();
        }
        if (bids[id][msg.sender].expiry != 0) revert AlreadyBid();
        if (bidders[id].length == MAX_BIDDERS) revert TooManyBidders();
        if (!_eligible(request, bid, msg.sender)) revert IneligibleQuote();
        bids[id][msg.sender] = bid;
        bidders[id].push(msg.sender);
        emit BidSubmitted(id, msg.sender, bid.guaranteedOut, bid.expiry);
    }

    function withdraw(bytes32 id) external {
        if (phase(id) != Phase.Open) revert BiddingClosed();
        Bid storage bid = bids[id][msg.sender];
        if (bid.guaranteedOut == 0) revert InvalidBid();
        // Leave the original slot occupied to prevent repeat bids and keep the set bounded.
        bid.guaranteedOut = 0;
        emit BidWithdrawn(id, msg.sender);
    }

    function select(bytes32 id) external returns (bytes32 digest) {
        if (hub.executionPaused()) revert SelectionUnavailable();
        Request storage request = requests[id];
        if (phase(id) != Phase.AwaitingSelection) revert SelectionUnavailable();
        address winner;
        uint256 best;
        address[] storage candidates = bidders[id];
        for (uint256 i; i < candidates.length; ++i) {
            address candidate = candidates[i];
            Bid storage bid = bids[id][candidate];
            if (bid.guaranteedOut == 0 || !_eligible(request, bid, candidate)) continue;
            (Hub.Order memory candidateOrder, ILQCInternalSolverIntent.RouteIntent memory candidateRoute) =
                _execution(id, candidate);
            if (requestForIntent[hub.digest(candidateOrder, candidateRoute)] != bytes32(0)) continue;
            if (bid.guaranteedOut > best || (bid.guaranteedOut == best && candidate < winner)) {
                winner = candidate;
                best = bid.guaranteedOut;
            }
        }
        if (winner == address(0)) revert SelectionUnavailable();
        (Hub.Order memory order, ILQCInternalSolverIntent.RouteIntent memory route) = _execution(id, winner);
        digest = hub.digest(order, route);
        if (requestForIntent[digest] != bytes32(0)) revert InvalidSelection();
        bytes32 quote = hub.quoteHash(order, route);
        assignments.assign(digest, winner, quote, best, order.quoteExpiry);
        selectedIntent[id] = digest;
        requestForIntent[digest] = id;
        emit WinnerSelected(id, digest, winner, quote, best);
    }

    function selectedExecution(bytes32 id) external view
        returns (Hub.Order memory order, ILQCInternalSolverIntent.RouteIntent memory route)
    {
        bytes32 intent = selectedIntent[id];
        if (intent == bytes32(0)) revert InvalidSelection();
        (address winner,,,,) = assignments.assignments(intent);
        (order, route) = _execution(id, winner);
        route.intentHash = intent;
    }

    function validateExecution(bytes32 digest, address solver) external view {
        if (hub.executionPaused()) revert SelectionUnavailable();
        bytes32 id = requestForIntent[digest];
        (address assigned,,,,) = assignments.assignments(digest);
        if (id == bytes32(0) || phase(id) != Phase.Selected || assigned != solver ||
            assignments.assigner() != address(this)) revert InvalidSelection();
        if (!_eligible(requests[id], bids[id][solver], solver)) revert IneligibleQuote();
    }

    function _execution(bytes32 id, address solver) private view
        returns (Hub.Order memory order, ILQCInternalSolverIntent.RouteIntent memory route)
    {
        Request storage request = requests[id];
        Bid storage bid = bids[id][solver];
        order = Hub.Order(request.user, request.nonce, solver, bid.adapter, bid.expiry);
        route = ILQCInternalSolverIntent.RouteIntent(bytes32(0), bid.dexId, request.tokenIn,
            request.tokenOut, request.amountIn, bid.guaranteedOut, request.recipient, request.deadline, bid.routeData);
    }

    function _eligible(Request storage request, Bid memory bid, address solver) private view returns (bool) {
        if (bid.expiry <= block.timestamp || !_capacity(solver, request.amountIn) || !_riskAllows(request, bid.dexId)) {
            return false;
        }
        (address adapter, bool enabled,) = router.registry().getDex(bid.dexId);
        if (!enabled || adapter != bid.adapter || adapter.code.length == 0) return false;
        try ILQCExecutionAdapter(adapter).supportsExecution() returns (bool executable) {
            if (!executable) return false;
        } catch { return false; }
        try ILQCDexAdapter(adapter).quoteExactInput(request.tokenIn, request.tokenOut, request.amountIn, bid.routeData)
            returns (uint256 output)
        {
            return output >= bid.guaranteedOut;
        } catch { return false; }
    }

    function _capacity(address solver, uint256 amount) private view returns (bool) {
        if (registry.paused() || vault.paused() || !reputation.eligible(solver)) return false;
        (uint256 registryBond, uint256 exposure, bool active) = registry.solvers(solver);
        (bool enabled, uint16 collateralBps) = vault.policy(stablecoin);
        uint256 vaultBond = vault.balances(solver, stablecoin);
        uint256 limit = registry.exposureLimit();
        if (!active || !enabled || collateralBps != 10_000 ||
            registryBond < registry.minimumBond() || vaultBond < registry.minimumBond() ||
            exposure > limit || exposure > registryBond || exposure > vaultBond) return false;
        return amount <= limit - exposure && amount <= registryBond - exposure && amount <= vaultBond - exposure;
    }

    function _riskAllows(Request storage request, bytes32 dexId) private view returns (bool) {
        (bool inAllowed, uint256 perTx, uint256 perDay) = risk.tokenLimits(request.tokenIn);
        (bool outAllowed,,) = risk.tokenLimits(request.tokenOut);
        if (risk.executor() != address(router) || risk.swapsPaused() || !inAllowed || !outAllowed ||
            request.amountIn > perTx || request.amountIn > perDay ||
            request.amountIn > risk.dexTokenCap(dexId, request.tokenIn)) return false;
        (uint64 day, uint192 used) = risk.dailyUsage(request.tokenIn);
        return day != block.timestamp / 1 days || used <= perDay - request.amountIn;
    }
}
