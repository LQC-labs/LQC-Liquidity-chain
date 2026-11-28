// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";

import {LQCPayoutGate} from "./LQCPayoutGate.sol";

/// @notice Dedicated reward treasury. Only explicitly funded balances can back a grant.
contract LQCCreatorRewardVault {
    using SafeTransferLib for address;

    enum Category { Production, Activity, NetRevenue }
    struct Reward {
        bytes32 source;
        bytes32 campaign;
        Category category;
        address asset;
        address recipient;
        uint256 amount;
        bool paid;
    }

    struct Payout {
        bytes32 id;
        address asset;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint64 deadline;
    }

    bytes32 private constant DOMAIN = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PAYOUT = keccak256("Payout(bytes32 id,address asset,address recipient,uint256 amount,uint256 nonce,uint64 deadline)");

    address public immutable treasury;
    address public immutable approver;
    address public immutable activationAuthority;
    bool public paymentsEnabled;
    uint256 private unlocked = 1;
    mapping(address => bool) public allowedAsset;
    mapping(bytes32 => uint256) public available;
    mapping(address => uint256) public accounted;
    mapping(bytes32 => Reward) public rewards;
    mapping(bytes32 => bool) public usedSource;
    mapping(address => bytes32[]) private recipientRewards;

    address public payoutExecutor;
    mapping(address => uint256) public payoutNonce;
    mapping(bytes32 => bytes32) public payoutApproval;
    mapping(bytes32 => bool) public retiredPayoutDigest;

    struct AssetTotals {
        uint256 funded;
        uint256 confirmed;
        uint256 paid;
    }
    mapping(address => AssetTotals) public assetTotals;
    struct Schedule { uint256 nonce; uint64 deadline; }
    mapping(bytes32 => Schedule) public payoutSchedule;

    LQCPayoutGate public payoutGate;
    bool public migrationSealed;
    bool private hasConfirmed;
    LQCCreatorRewardVault public successor;
    LQCCreatorRewardVault public predecessor;
    mapping(bytes32 => bool) public migrated;
    mapping(address => uint256) public migrationOut;
    uint256 public outstandingRewards;
    bool public migrationComplete;
    event MigrationStarted(address indexed predecessor);
    event MigrationCompleted(address indexed peer);
    event MigrationSealed(address indexed successor);
    event RewardMigrated(bytes32 indexed id, address indexed peer, uint256 amount);
    event PayoutGateBound(address indexed gate);

    function configurePayoutGate(address risk, address guardian) external guarded returns (LQCPayoutGate gate) {
        if (msg.sender != activationAuthority || address(payoutGate) != address(0)) revert Unauthorized();
        if (risk == payoutExecutor || risk == approver || risk == treasury || risk == activationAuthority ||
            guardian == payoutExecutor || guardian == approver || guardian == treasury || guardian == activationAuthority) {
            revert Unauthorized();
        }
        gate = new LQCPayoutGate(address(this), risk, guardian);
        payoutGate = gate;
        emit PayoutGateBound(address(gate));
    }

    function bindPredecessor(LQCCreatorRewardVault old) external guarded {
        if (msg.sender != activationAuthority || address(predecessor) != address(0) ||
            address(old) == address(this) || address(old).code.length == 0 || paymentsEnabled || migrationSealed || hasConfirmed) {
            revert Unauthorized();
        }
        if (address(old.predecessor()) != address(0)) revert Unauthorized();
        predecessor = old;
        emit MigrationStarted(address(old));
    }

    function sealForMigration(LQCCreatorRewardVault next) external guarded {
        if (msg.sender != activationAuthority || paymentsEnabled || migrationSealed ||
            address(predecessor) != address(0) || address(next) == address(this) || address(next).code.length == 0 || next.predecessor() != this) revert Unauthorized();
        migrationSealed = true;
        successor = next;
        emit MigrationSealed(address(next));
    }

    function migrateUnpaid(bytes32 id) external guarded {
        if (msg.sender != activationAuthority || !migrationSealed) revert Unauthorized();
        Reward storage grant = rewards[id];
        if (grant.amount == 0 || grant.paid || migrated[id]) revert InvalidReward();
        IERC20 token = IERC20(grant.asset);
        uint256 held = token.balanceOf(address(this));
        if (held < accounted[grant.asset]) revert InsufficientFunding();
        migrated[id] = true;
        --outstandingRewards;
        accounted[grant.asset] -= grant.amount;
        migrationOut[grant.asset] += grant.amount;
        delete payoutApproval[id];
        delete payoutSchedule[id];
        grant.asset.forceApprove(address(successor), grant.amount);
        successor.acceptMigratedReward(id);
        grant.asset.forceApprove(address(successor), 0);
        if (token.balanceOf(address(this)) != held - grant.amount) revert TransferMismatch();
        emit RewardMigrated(id, address(successor), grant.amount);
    }

    function acceptMigratedReward(bytes32 id) external guarded {
        LQCCreatorRewardVault old = predecessor;
        if (msg.sender != address(old) || migrationSealed || migrationComplete || paymentsEnabled || !old.migrationSealed() ||
            old.successor() != this || !old.migrated(id)) revert Unauthorized();
        (bytes32 source, bytes32 campaign, Category category, address asset, address recipient, uint256 amount, bool paid) =
            old.rewards(id);
        if (paid || amount == 0 || !allowedAsset[asset] || usedSource[source] || rewards[id].amount != 0) revert InvalidReward();
        IERC20 token = IERC20(asset);
        uint256 held = token.balanceOf(address(this));
        if (held < accounted[asset]) revert InsufficientFunding();
        rewards[id] = Reward(source, campaign, category, asset, recipient, amount, false);
        usedSource[source] = true;
        recipientRewards[recipient].push(id);
        ++outstandingRewards;
        accounted[asset] += amount;
        assetTotals[asset].funded += amount;
        hasConfirmed = true;
        assetTotals[asset].confirmed += amount;
        asset.safeTransferFrom(address(old), address(this), amount);
        if (token.balanceOf(address(this)) != held + amount) revert TransferMismatch();
        emit RewardMigrated(id, address(old), amount);
    }

    function finalizeMigration() external guarded {
        if (msg.sender != activationAuthority || !migrationSealed || migrationComplete || outstandingRewards != 0) {
            revert Unauthorized();
        }
        migrationComplete = true;
        successor.acceptMigrationCompletion();
        emit MigrationCompleted(address(successor));
    }

    function acceptMigrationCompletion() external guarded {
        LQCCreatorRewardVault old = predecessor;
        if (msg.sender != address(old) || migrationComplete || !old.migrationSealed() ||
            !old.migrationComplete() || old.successor() != this || old.outstandingRewards() != 0) revert Unauthorized();
        migrationComplete = true;
        emit MigrationCompleted(address(old));
    }

    error Unauthorized();
    error InvalidReward();
    error InsufficientFunding();
    error TransfersDisabled();
    error TransferMismatch();
    error Reentrancy();

    event PayoutExecutorBound(address indexed executor);
    event PayoutApproved(bytes32 indexed id, bytes32 indexed digest);
    event PayoutRevoked(bytes32 indexed id);
    event AssetPolicy(address indexed asset, bool allowed);
    event PaymentPolicy(bool enabled);
    event Funded(bytes32 indexed campaign, Category indexed category, address indexed asset, uint256 amount);
    event Confirmed(bytes32 indexed id, bytes32 indexed source, address indexed recipient, address asset, uint256 amount);
    event Paid(bytes32 indexed id, address indexed recipient, address indexed asset, uint256 amount);

    constructor(address treasury_, address approver_, address activation_) {
        if (treasury_ == address(0) || approver_ == address(0) || activation_ == address(0) ||
            treasury_ == approver_ || treasury_ == activation_ || approver_ == activation_) revert Unauthorized();
        treasury = treasury_;
        approver = approver_;
        activationAuthority = activation_;
    }

    modifier guarded() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    function setAsset(address asset, bool allowed) external guarded {
        if (msg.sender != activationAuthority) revert Unauthorized();
        if (asset.code.length == 0) revert InvalidReward();
        allowedAsset[asset] = allowed;
        emit AssetPolicy(asset, allowed);
    }

    function bindPayoutExecutor(address executor) external guarded {
        if (msg.sender != activationAuthority || payoutExecutor != address(0) || executor == address(0) ||
            executor == approver || executor == treasury || executor == activationAuthority ||
            (address(payoutGate) != address(0) && (executor == payoutGate.risk() || executor == payoutGate.guardian()))) revert Unauthorized();
        payoutExecutor = executor;
        emit PayoutExecutorBound(executor);
    }

    function setPaymentsEnabled(bool enabled) external guarded {
        if (msg.sender != activationAuthority) revert Unauthorized();
        if (enabled && (address(payoutGate) == address(0) || payoutExecutor == address(0) || migrationSealed ||
            (address(predecessor) != address(0) && !migrationComplete))) revert Unauthorized();
        paymentsEnabled = enabled;
        emit PaymentPolicy(enabled);
    }

    function book(bytes32 campaign, Category category, address asset) public pure returns (bytes32) {
        return keccak256(abi.encode(campaign, category, asset));
    }

    function assetReconciliation(address asset) external view returns (
        uint256 actual, uint256 assigned, uint256 availableBudget,
        uint256 unpaid, uint256 paid, uint256 unallocated
    ) {
        AssetTotals storage totals = assetTotals[asset];
        actual = IERC20(asset).balanceOf(address(this));
        assigned = accounted[asset];
        availableBudget = totals.funded - totals.confirmed;
        paid = totals.paid;
        unpaid = totals.confirmed - paid - migrationOut[asset];
        if (actual < assigned) revert InsufficientFunding();
        if (availableBudget + unpaid != assigned) revert TransferMismatch();
        unallocated = actual - assigned;
    }

    function rewardCount(address recipient) external view returns (uint256) { return recipientRewards[recipient].length; }
    function rewardAt(address recipient, uint256 index) external view returns (bytes32) {
        return recipientRewards[recipient][index];
    }

    function fund(bytes32 campaign, Category category, address asset, uint256 amount) external guarded {
        if (msg.sender != treasury || migrationSealed) revert Unauthorized();
        if (!allowedAsset[asset] || campaign == bytes32(0) || amount == 0) revert InvalidReward();
        IERC20 token = IERC20(asset);
        uint256 held = token.balanceOf(address(this));
        uint256 sender = token.balanceOf(msg.sender);
        if (held < accounted[asset]) revert InsufficientFunding();
        available[book(campaign, category, asset)] += amount;
        accounted[asset] += amount;
        assetTotals[asset].funded += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != held + amount || token.balanceOf(msg.sender) != sender - amount) {
            revert TransferMismatch();
        }
        emit Funded(campaign, category, asset, amount);
    }

    function confirm(bytes32 source, bytes32 campaign, Category category, address asset, address recipient, uint256 amount)
        external guarded returns (bytes32 id)
    {
        if (msg.sender != approver || migrationSealed) revert Unauthorized();
        if (source == bytes32(0) || usedSource[source] ||
            (address(predecessor) != address(0) && predecessor.usedSource(source)) || campaign == bytes32(0) || recipient == address(0) ||
            recipient == address(this) || amount == 0 || !allowedAsset[asset]) revert InvalidReward();
        bytes32 key = book(campaign, category, asset);
        if (amount > available[key] || IERC20(asset).balanceOf(address(this)) < accounted[asset]) {
            revert InsufficientFunding();
        }
        id = keccak256(abi.encode(block.chainid, address(this), source, campaign, category, asset, recipient, amount));
        available[key] -= amount;
        usedSource[source] = true;
        hasConfirmed = true;
        assetTotals[asset].confirmed += amount;
        rewards[id] = Reward(source, campaign, category, asset, recipient, amount, false);
        recipientRewards[recipient].push(id);
        ++outstandingRewards;
        emit Confirmed(id, source, recipient, asset, amount);
    }

    function claimable(bytes32 id) public view returns (uint256) {
        Reward storage reward = rewards[id];
        if (!paymentsEnabled || migrationSealed || !payoutGate.isPermitted(payoutApproval[id]) || reward.paid || reward.amount == 0 || !allowedAsset[reward.asset]) return 0;
        if (IERC20(reward.asset).balanceOf(address(this)) < accounted[reward.asset]) return 0;
        return reward.amount;
    }

    /// @dev Retain the legacy selector. Payouts use executeApprovedPayout.
    function claim(bytes32) external pure { revert Unauthorized(); }

    function payoutDigest(Payout calldata request) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN, keccak256("LQC Creator Reward Vault"), keccak256("2"),
            block.chainid, address(this)));
        return keccak256(abi.encodePacked(hex"1901", domain, keccak256(abi.encode(
            PAYOUT, request.id, request.asset, request.recipient, request.amount, request.nonce, request.deadline))));
    }

    function approvePayout(Payout calldata request) external guarded {
        if (msg.sender != approver || payoutExecutor == address(0)) revert Unauthorized();
        _checkPayout(request);
        if (payoutApproval[request.id] != bytes32(0)) revert InvalidReward();
        bytes32 digest = payoutDigest(request);
        if (retiredPayoutDigest[digest]) revert InvalidReward();
        payoutApproval[request.id] = digest;
        payoutSchedule[request.id] = Schedule(request.nonce, request.deadline);
        emit PayoutApproved(request.id, digest);
    }

    function revokePayout(bytes32 id) external guarded {
        if (msg.sender != approver) revert Unauthorized();
        bytes32 digest = payoutApproval[id];
        if (digest == bytes32(0)) revert InvalidReward();
        retiredPayoutDigest[digest] = true;
        delete payoutApproval[id];
        delete payoutSchedule[id];
        emit PayoutRevoked(id);
    }

    function executeApprovedPayout(Payout calldata request, bytes calldata signature) external guarded {
        if (msg.sender != payoutExecutor || msg.sender == request.recipient) revert Unauthorized();
        if (!paymentsEnabled) revert TransfersDisabled();
        _checkPayout(request);
        bytes32 digest = payoutDigest(request);
        if (payoutApproval[request.id] != digest || !_signed(request.recipient, digest, signature)) revert Unauthorized();
        payoutGate.consume(digest);
        delete payoutApproval[request.id];
        delete payoutSchedule[request.id];
        ++payoutNonce[request.recipient];
        rewards[request.id].paid = true;
        --outstandingRewards;
        accounted[request.asset] -= request.amount;
        assetTotals[request.asset].paid += request.amount;
        IERC20 token = IERC20(request.asset);
        uint256 held = token.balanceOf(address(this));
        uint256 recipient = token.balanceOf(request.recipient);
        request.asset.safeTransfer(request.recipient, request.amount);
        if (token.balanceOf(address(this)) != held - request.amount ||
            token.balanceOf(request.recipient) != recipient + request.amount) revert TransferMismatch();
        emit Paid(request.id, request.recipient, request.asset, request.amount);
    }

    function _checkPayout(Payout calldata request) private view {
        Reward storage reward = rewards[request.id];
        if (migrationSealed || migrated[request.id] || reward.paid || request.amount == 0 || reward.amount != request.amount ||
            reward.asset != request.asset || reward.recipient != request.recipient ||
            request.nonce != payoutNonce[request.recipient] || request.deadline <= block.timestamp ||
            !allowedAsset[request.asset]) revert InvalidReward();
        if (IERC20(request.asset).balanceOf(address(this)) < accounted[request.asset]) revert InsufficientFunding();
    }

    function _signed(address signer, bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (signer.code.length != 0) {
            (bool ok, bytes memory result) = signer.staticcall(abi.encodeWithSelector(bytes4(0x1626ba7e), digest, signature));
            return ok && result.length >= 32 && bytes4(result) == 0x1626ba7e;
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 ||
            (v != 27 && v != 28)) return false;
        return ecrecover(digest, v, r, s) == signer;
    }
}
