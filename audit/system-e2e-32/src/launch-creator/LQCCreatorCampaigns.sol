// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCLaunchProjectRegistry} from "./LQCLaunchProjectRegistry.sol";
import {LQCAtomicSettlementVerifier} from "../intent-v1/LQCAtomicSettlementVerifier.sol";
import {LQCExecutionReceipt} from "../intent-v1/LQCExecutionReceipt.sol";
import {LQCCoreIntentState} from "../intent-v1/LQCCoreIntentState.sol";

/// @notice Isolated activity and budget ledger. All values use the configured accounting unit.
/// @dev No token approvals, custody or transfer capability. Finance attests realized net revenue separately.
contract LQCCreatorCampaigns {
    enum Review { Missing, Pending, Approved, Rejected }
    enum ActivityStatus { Missing, Pending, Confirmed, Rejected }

    struct Campaign {
        uint256 projectId;
        bytes32 briefHash;
        uint64 startsAt;
        uint64 endsAt;
        uint64 closedAt;
        uint16 shareBps;
        uint128 productionBudget;
        uint128 rewardBudget;
        uint128 productionCommitted;
        uint128 rewardReserved;
        uint128 rewardConfirmed;
    }

    struct Participation {
        bytes32 contentHash;
        bytes32 reviewHash;
        uint64 approvedAt;
        uint128 productionCommitment;
        Review contentStatus;
    }

    struct Attribution {
        uint256 campaignId;
        address creator;
        uint64 consentedAt;
        uint64 revokedAt;
    }

    struct Activity {
        uint256 campaignId;
        address user;
        address creator;
        uint128 netRevenue;
        uint128 reward;
        bytes32 revenueEvidence;
        ActivityStatus status;
    }

    struct Dashboard {
        uint256 referrals;
        uint256 revokedReferrals;
        uint256 pendingActivities;
        uint256 qualifyingActivities;
        uint256 estimatedRewards;
        uint256 confirmedRewards;
        uint256 productionCommitments;
        uint256 paidRewards;
    }

    LQCLaunchProjectRegistry public immutable projects;
    LQCAtomicSettlementVerifier public immutable settlementVerifier;
    address public immutable campaignAdmin;
    address public immutable identityReviewer;
    address public immutable contentReviewer;
    address public immutable revenueReporter;
    address public immutable financeReviewer;
    bytes32 public immutable accountingUnit;

    uint256 public campaignCount;
    mapping(uint256 => Campaign) public campaigns;
    mapping(address => bytes32) public identityOf;
    mapping(bytes32 => address) public accountForIdentity;
    mapping(address => bytes32) public profiles;
    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(uint256 => mapping(address => Participation)) public participations;
    mapping(bytes32 => bool) public usedContent;
    mapping(address => Attribution) public attributions;
    mapping(uint256 => mapping(address => bool)) public countedUser;
    mapping(bytes32 => bool) public usedRevenueEvidence;
    mapping(bytes32 => Activity) public activities;
    mapping(uint256 => mapping(address => Dashboard)) private dashboards;

    error Unauthorized();
    error InvalidCampaign();
    error InvalidIdentity();
    error InvalidContent();
    error InvalidAttribution();
    error InvalidActivity();
    error BudgetExceeded();

    event CampaignCreated(uint256 indexed campaignId, uint256 indexed projectId, bytes32 briefHash);
    event CampaignClosed(uint256 indexed campaignId, uint64 closedAt);
    event ProfileUpdated(address indexed creator, bytes32 profileHash);
    event CampaignJoined(uint256 indexed campaignId, address indexed creator);
    event ContentSubmitted(uint256 indexed campaignId, address indexed creator, bytes32 contentHash);
    event ContentReviewed(uint256 indexed campaignId, address indexed creator, Review decision, bytes32 reviewHash);
    event AttributionChanged(address indexed user, uint256 indexed campaignId, address indexed creator, bool revoked);
    event ActivityReviewed(bytes32 indexed settlementId, ActivityStatus status, bytes32 evidenceHash);
    event ActivityReported(bytes32 indexed settlementId, uint256 indexed campaignId, address indexed creator,
        uint128 netRevenue, uint128 reward, bytes32 revenueEvidence);

    constructor(
        LQCLaunchProjectRegistry projects_,
        LQCAtomicSettlementVerifier verifier_,
        address[5] memory operators,
        bytes32 accountingUnit_
    ) {
        if (address(projects_).code.length == 0 || address(verifier_).code.length == 0 ||
            accountingUnit_ == bytes32(0)) revert InvalidCampaign();
        for (uint256 i; i < operators.length; ++i) {
            if (operators[i] == address(0) || operators[i] == projects_.reviewer()) revert Unauthorized();
            for (uint256 j; j < i; ++j) {
                if (operators[i] == operators[j]) revert Unauthorized();
            }
        }
        projects = projects_;
        settlementVerifier = verifier_;
        campaignAdmin = operators[0];
        identityReviewer = operators[1];
        contentReviewer = operators[2];
        revenueReporter = operators[3];
        financeReviewer = operators[4];
        accountingUnit = accountingUnit_;
    }

    function createCampaign(
        uint256 projectId, bytes32 briefHash, uint64 startsAt, uint64 endsAt,
        uint128 productionBudget, uint128 rewardBudget, uint16 shareBps
    ) external returns (uint256 id) {
        if (msg.sender != campaignAdmin) revert Unauthorized();
        if (!projects.isApproved(projectId) || briefHash == bytes32(0) || startsAt < block.timestamp ||
            endsAt <= startsAt || shareBps > 10_000 || (rewardBudget != 0 && shareBps == 0)) {
            revert InvalidCampaign();
        }
        id = ++campaignCount;
        campaigns[id] = Campaign(projectId, briefHash, startsAt, endsAt, 0, shareBps,
            productionBudget, rewardBudget, 0, 0, 0);
        emit CampaignCreated(id, projectId, briefHash);
    }

    function closeCampaign(uint256 id) external {
        if (msg.sender != campaignAdmin) revert Unauthorized();
        Campaign storage campaign = campaigns[id];
        if (campaign.projectId == 0 || campaign.closedAt != 0) revert InvalidCampaign();
        campaign.closedAt = uint64(block.timestamp);
        emit CampaignClosed(id, campaign.closedAt);
    }

    /// @dev Use a random opaque identifier from the reviewed off-chain identity system.
    function verifyIdentity(address account, bytes32 identity) external {
        if (msg.sender != identityReviewer || account == msg.sender) revert Unauthorized();
        if (account == address(0) || identity == bytes32(0) || identityOf[account] != bytes32(0) ||
            accountForIdentity[identity] != address(0)) revert InvalidIdentity();
        identityOf[account] = identity;
        accountForIdentity[identity] = account;
    }

    function updateProfile(bytes32 profileHash) external {
        if (identityOf[msg.sender] == bytes32(0) || profileHash == bytes32(0)) revert InvalidIdentity();
        profiles[msg.sender] = profileHash;
        emit ProfileUpdated(msg.sender, profileHash);
    }

    function joinCampaign(uint256 id) external {
        if (!_isLive(campaigns[id], block.timestamp) || joined[id][msg.sender]) revert InvalidCampaign();
        if (profiles[msg.sender] == bytes32(0)) revert InvalidIdentity();
        joined[id][msg.sender] = true;
        emit CampaignJoined(id, msg.sender);
    }

    function submitContent(uint256 id, bytes32 contentHash) external {
        Participation storage entry = participations[id][msg.sender];
        if (!_isLive(campaigns[id], block.timestamp) || !joined[id][msg.sender] || contentHash == bytes32(0) ||
            usedContent[contentHash] || entry.contentStatus == Review.Pending || entry.contentStatus == Review.Approved) {
            revert InvalidContent();
        }
        entry.contentHash = contentHash;
        entry.reviewHash = bytes32(0);
        entry.contentStatus = Review.Pending;
        emit ContentSubmitted(id, msg.sender, contentHash);
    }

    function reviewContent(uint256 id, address creator, bytes32 contentHash, bytes32 reviewHash,
        bool approved, uint128 productionCommitment) external
    {
        if (msg.sender != contentReviewer || msg.sender == creator) revert Unauthorized();
        Campaign storage campaign = campaigns[id];
        Participation storage entry = participations[id][creator];
        if (!_isLive(campaign, block.timestamp) || entry.contentStatus != Review.Pending ||
            entry.contentHash != contentHash || reviewHash == bytes32(0)) revert InvalidContent();
        if (approved) {
            if (usedContent[contentHash]) revert InvalidContent();
            if (productionCommitment > campaign.productionBudget - campaign.productionCommitted) {
                revert BudgetExceeded();
            }
            usedContent[contentHash] = true;
            entry.approvedAt = uint64(block.timestamp);
            entry.productionCommitment = productionCommitment;
            campaign.productionCommitted += productionCommitment;
            dashboards[id][creator].productionCommitments += productionCommitment;
        } else if (productionCommitment != 0) {
            revert InvalidContent();
        }
        entry.reviewHash = reviewHash;
        entry.contentStatus = approved ? Review.Approved : Review.Rejected;
        emit ContentReviewed(id, creator, entry.contentStatus, reviewHash);
    }

    function referralCode(uint256 id, address creator) public view returns (bytes32) {
        if (participations[id][creator].contentStatus != Review.Approved) revert InvalidAttribution();
        return keccak256(abi.encode(block.chainid, address(this), id, creator));
    }

    function consentToReferral(uint256 id, address creator, bytes32 code) external {
        if (!_isLive(campaigns[id], block.timestamp) || creator == msg.sender || identityOf[msg.sender] == bytes32(0) ||
            attributions[msg.sender].campaignId != 0 || referralCode(id, creator) != code) revert InvalidAttribution();
        attributions[msg.sender] = Attribution(id, creator, uint64(block.timestamp), 0);
        ++dashboards[id][creator].referrals;
        emit AttributionChanged(msg.sender, id, creator, false);
    }

    function revokeReferral() external {
        Attribution storage attribution = attributions[msg.sender];
        if (attribution.campaignId == 0 || attribution.revokedAt != 0) revert InvalidAttribution();
        attribution.revokedAt = uint64(block.timestamp);
        ++dashboards[attribution.campaignId][attribution.creator].revokedReferrals;
        emit AttributionChanged(msg.sender, attribution.campaignId, attribution.creator, true);
    }

    /// @notice Reports one settled use per referred account, with uniquely scoped net-revenue evidence.
    function reportActivity(bytes32 settlementId, bytes32 revenueEvidence, uint128 netRevenue) external {
        if (msg.sender != revenueReporter) revert Unauthorized();
        if (activities[settlementId].status != ActivityStatus.Missing || revenueEvidence == bytes32(0) ||
            usedRevenueEvidence[revenueEvidence] || netRevenue == 0) revert InvalidActivity();
        (address user, uint256 executedAt) = _settledUser(settlementId);
        Attribution memory attribution = attributions[user];
        Campaign storage campaign = campaigns[attribution.campaignId];
        if (attribution.consentedAt == 0 || executedAt <= attribution.consentedAt || !_isLive(campaign, executedAt) ||
            (attribution.revokedAt != 0 && executedAt >= attribution.revokedAt) ||
            countedUser[attribution.campaignId][user]) revert InvalidActivity();

        uint128 reward = uint128(uint256(netRevenue) * campaign.shareBps / 10_000);
        if (reward == 0 || reward > campaign.rewardBudget - campaign.rewardReserved - campaign.rewardConfirmed) {
            revert BudgetExceeded();
        }
        countedUser[attribution.campaignId][user] = true;
        usedRevenueEvidence[revenueEvidence] = true;
        campaign.rewardReserved += reward;
        activities[settlementId] = Activity(attribution.campaignId, user, attribution.creator,
            netRevenue, reward, revenueEvidence, ActivityStatus.Pending);
        Dashboard storage totals = dashboards[attribution.campaignId][attribution.creator];
        ++totals.pendingActivities;
        totals.estimatedRewards += reward;
        emit ActivityReported(settlementId, attribution.campaignId, attribution.creator, netRevenue, reward, revenueEvidence);
    }

    function reviewActivity(bytes32 settlementId, bool approved, bytes32 evidenceHash) external {
        if (msg.sender != financeReviewer) revert Unauthorized();
        Activity storage activity = activities[settlementId];
        if (activity.status != ActivityStatus.Pending || evidenceHash == bytes32(0)) revert InvalidActivity();
        Campaign storage campaign = campaigns[activity.campaignId];
        Dashboard storage totals = dashboards[activity.campaignId][activity.creator];
        campaign.rewardReserved -= activity.reward;
        totals.estimatedRewards -= activity.reward;
        --totals.pendingActivities;
        if (approved) {
            campaign.rewardConfirmed += activity.reward;
            totals.confirmedRewards += activity.reward;
            ++totals.qualifyingActivities;
        } else {
            countedUser[activity.campaignId][activity.user] = false;
        }
        activity.status = approved ? ActivityStatus.Confirmed : ActivityStatus.Rejected;
        emit ActivityReviewed(settlementId, activity.status, evidenceHash);
    }

    function dashboard(uint256 id, address creator) external view returns (Dashboard memory) {
        return dashboards[id][creator];
    }

    function _settledUser(bytes32 settlementId) private view returns (address, uint256) {
        (bytes32 intentHash, bytes32 receiptHash,,, uint256 amountOut) = settlementVerifier.verifications(settlementId);
        if (settlementId == bytes32(0) || intentHash == bytes32(0) || receiptHash == bytes32(0) || amountOut == 0 ||
            settlementVerifier.settlementForIntent(intentHash) != settlementId ||
            settlementVerifier.settlementForReceipt(receiptHash) != settlementId) revert InvalidActivity();
        LQCExecutionReceipt receipt = settlementVerifier.hub().receipt();
        (,,, uint256 received, uint256 recordedAt) = receipt.receipts(intentHash);
        LQCCoreIntentState.IntentRecord memory record = settlementVerifier.hub().escrow().intentRecord(intentHash);
        if (record.status != LQCCoreIntentState.IntentStatus.Executed || received != amountOut ||
            receipt.getReceiptHash(intentHash) != receiptHash || recordedAt == 0) revert InvalidActivity();
        return (record.sender, recordedAt);
    }

    function _isLive(Campaign storage campaign, uint256 time) private view returns (bool) {
        return campaign.projectId != 0 && time >= campaign.startsAt && time < campaign.endsAt &&
            (campaign.closedAt == 0 || time < campaign.closedAt);
    }
}
