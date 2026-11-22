// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCFuturesM26TwoSidedFxPreview} from "./LQCFuturesM26TwoSidedFxPreview.sol";
import {LQCFuturesVault} from "./LQCFuturesVault.sol";

/// @notice M27 research-only, positive-review budget and collision-resistant claim reservations.
/// @dev Review records are NOT proof of independent asset provenance. No payable function,
/// token transfers, Vault authority, Engine privileges or production entitlement.
contract LQCFuturesM27SurplusProvenanceReview {
    LQCFuturesM26TwoSidedFxPreview public immutable fx;
    LQCFuturesVault public immutable vault;
    address public immutable reviewer;

    struct Budget {
        bytes32 evidenceHash;
        uint256 reviewedAmount;
        uint256 encumberedClaims;
        uint256 reservedQuotes;
    }

    struct Reservation {
        address token;
        address claimant;
        uint256 tokenUnits;
        bytes32 evidenceHash;
        bool active;
    }

    mapping(address => Budget) public budgets;
    mapping(bytes32 => Reservation) public reservations;
    mapping(bytes32 => bool) public claimIdsUsed;

    error NotReviewer();
    error InvalidEvidence();
    error InvalidBudget();
    error UnreviewedSurplus();
    error OutstandingClaims();
    error DuplicateClaim();
    error InvalidClaim();
    error InsufficientReviewBudget();
    error OvercommittedPhysicalSurplus();
    error UnresolvedBadDebt();

    event BudgetReviewed(address indexed token,bytes32 indexed evidenceHash,
        uint256 reviewedAmount,uint256 encumberedClaims);
    event ClaimReserved(bytes32 indexed claimId,address indexed token,address indexed claimant,
        uint256 amount,bytes32 evidenceHash);
    event ClaimCancelled(bytes32 indexed claimId,address indexed token,uint256 amount);

    modifier onlyReviewer() {
        if(msg.sender!=reviewer)revert NotReviewer();
        _;
    }

    constructor(address fx_,address reviewer_) {
        if(fx_==address(0)||fx_.code.length==0||reviewer_==address(0))
            revert InvalidBudget();
        fx=LQCFuturesM26TwoSidedFxPreview(fx_);
        vault=fx.vault();
        reviewer=reviewer_;
    }

    /// @dev Independent review is a *precondition*. This function only stores the reviewer's
    /// assertion; an evidence hash alone cannot establish legal title or economic ownership.
    /// Avoid changing the evidence while any claim is reserved.
    function reviewBudget(
        address token,bytes32 evidenceHash,uint256 reviewedAmount,uint256 encumberedClaims
    ) external onlyReviewer {
        Budget storage existing=budgets[token];
        if(token==address(0)||evidenceHash==bytes32(0)||reviewedAmount==0||
            encumberedClaims>reviewedAmount)revert InvalidEvidence();
        if(existing.reservedQuotes!=0)revert OutstandingClaims();
        if(vault.residualBadDebt(token)!=0)revert UnresolvedBadDebt();
        // Do not accept review budgets larger than presently observed physical excess.
        if(reviewedAmount>fx.unreservedVaultSurplus(token))revert OvercommittedPhysicalSurplus();
        budgets[token]=Budget({
            evidenceHash:evidenceHash,reviewedAmount:reviewedAmount,
            encumberedClaims:encumberedClaims,reservedQuotes:0
        });
        emit BudgetReviewed(token,evidenceHash,reviewedAmount,encumberedClaims);
    }

    function remainingReviewedBudget(address token) public view returns(uint256) {
        Budget memory budget=budgets[token];
        if(budget.evidenceHash==bytes32(0))return 0;
        return budget.reviewedAmount-budget.encumberedClaims-budget.reservedQuotes;
    }

    /// @dev Reviewed quote reservation only. It creates NO receivable and NO payout right.
    /// Reserve against one budget to demonstrate why independent repeated previews can overcommit.
    function reserveQuote(
        bytes32 claimId,address token,address claimant,uint256 profitUsd18,uint8 decimals,
        bytes32 expectedEvidenceHash
    ) external onlyReviewer returns(uint256 tokens) {
        if(claimId==bytes32(0)||claimant==address(0)||profitUsd18==0||
            expectedEvidenceHash==bytes32(0))revert InvalidClaim();
        if(claimIdsUsed[claimId])revert DuplicateClaim();

        Budget storage budget=budgets[token];
        if(budget.evidenceHash==bytes32(0)||budget.evidenceHash!=expectedEvidenceHash)
            revert UnreviewedSurplus();
        if(vault.residualBadDebt(token)!=0)revert UnresolvedBadDebt();

        // Authenticates token decimals, quote freshness and measured physical excess.
        (uint256 candidate,uint256 physicalExcess,)=fx.previewBoundedProfit(token,profitUsd18,decimals);
        tokens=candidate;
        if(tokens==0)revert InvalidClaim();
        uint256 remaining=remainingReviewedBudget(token);
        if(tokens>remaining)revert InsufficientReviewBudget();
        if(budget.reservedQuotes>physicalExcess ||
            tokens>physicalExcess-budget.reservedQuotes)revert OvercommittedPhysicalSurplus();

        budget.reservedQuotes+=tokens;
        claimIdsUsed[claimId]=true;
        reservations[claimId]=Reservation({
            token:token,claimant:claimant,tokenUnits:tokens,
            evidenceHash:expectedEvidenceHash,active:true
        });
        emit ClaimReserved(claimId,token,claimant,tokens,expectedEvidenceHash);
    }

    /// @dev Revokes an unspent research quote. Never deletes the claim's used ID.
    function cancelQuote(bytes32 claimId) external onlyReviewer {
        Reservation storage reservation=reservations[claimId];
        if(!reservation.active)revert InvalidClaim();
        reservation.active=false;
        budgets[reservation.token].reservedQuotes-=reservation.tokenUnits;
        emit ClaimCancelled(claimId,reservation.token,reservation.tokenUnits);
    }
}
