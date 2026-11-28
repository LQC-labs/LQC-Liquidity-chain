// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ILQCStakingRead} from "../staking/interfaces/ILQCStakingRead.sol";

/// @notice Reviewed project metadata and non-financial participation.
contract LQCLaunchProjectRegistry {
    enum Status { Missing, Draft, InReview, Approved, Rejected }

    struct Project {
        address applicant;
        bytes32 metadataHash;
        bytes32 reviewHash;
        uint256 minimumStake;
        Status status;
    }

    ILQCStakingRead public immutable stakingVault;
    address public immutable reviewer;
    uint256 public projectCount;
    mapping(uint256 => Project) public projects;
    mapping(uint256 => mapping(address => bool)) public interest;

    mapping(address => mapping(bytes32 => uint256)) public registeredProject;

    address public approver;
    mapping(uint256 => address) public saleOperator;
    mapping(uint256 => uint8) public recommendedDecision;

    event ApproverBound(address indexed approver);
    event SaleOperatorAssigned(uint256 indexed projectId, address indexed operator);
    event ReviewRecommended(uint256 indexed projectId, bool approved, bytes32 reviewHash);

    error Unauthorized();
    error InvalidProject();
    error Ineligible();

    event ProjectRegistered(uint256 indexed projectId, address indexed applicant, bytes32 metadataHash);
    event ProjectStatus(uint256 indexed projectId, Status status, bytes32 reviewHash);
    event InterestRegistered(uint256 indexed projectId, address indexed participant);

    constructor(ILQCStakingRead vault, address reviewer_) {
        if (address(vault).code.length == 0 || reviewer_ == address(0)) revert InvalidProject();
        stakingVault = vault;
        reviewer = reviewer_;
    }

    function bindApprover(address account) external {
        if (msg.sender != reviewer || approver != address(0) || projectCount != 0 ||
            account == address(0) || account == reviewer) revert Unauthorized();
        approver = account;
        emit ApproverBound(account);
    }

    function assignSaleOperator(uint256 id, address operator) external {
        Project storage project = projects[id];
        if (msg.sender != project.applicant) revert Unauthorized();
        if (project.status != Status.Draft || operator == address(0) || operator == project.applicant ||
            operator == reviewer || operator == approver || saleOperator[id] != address(0)) revert InvalidProject();
        saleOperator[id] = operator;
        emit SaleOperatorAssigned(id, operator);
    }

    function registerProject(bytes32 metadataHash, uint256 minimumStake) external returns (uint256 id) {
        if (metadataHash == bytes32(0) || registeredProject[msg.sender][metadataHash] != 0) revert InvalidProject();
        id = ++projectCount;
        registeredProject[msg.sender][metadataHash] = id;
        projects[id] = Project(msg.sender, metadataHash, bytes32(0), minimumStake, Status.Draft);
        emit ProjectRegistered(id, msg.sender, metadataHash);
    }

    function submitProject(uint256 id) external {
        Project storage project = projects[id];
        if (msg.sender != project.applicant) revert Unauthorized();
        if (project.status != Status.Draft) revert InvalidProject();
        if (approver != address(0) && saleOperator[id] == address(0)) revert InvalidProject();
        project.status = Status.InReview;
        emit ProjectStatus(id, Status.InReview, bytes32(0));
    }

    function reviewProject(uint256 id, bool approved, bytes32 reviewHash) external {
        Project storage project = projects[id];
        if (msg.sender != reviewer || msg.sender == project.applicant) revert Unauthorized();
        if (project.status != Status.InReview || reviewHash == bytes32(0)) revert InvalidProject();
        if (approver == address(0)) {
            project.status = approved ? Status.Approved : Status.Rejected;
            project.reviewHash = reviewHash;
            emit ProjectStatus(id, project.status, reviewHash);
            return;
        }
        if (recommendedDecision[id] != 0 || project.applicant == approver) revert InvalidProject();
        recommendedDecision[id] = approved ? 1 : 2;
        project.reviewHash = reviewHash;
        emit ReviewRecommended(id, approved, reviewHash);
    }

    function decideProject(uint256 id, bool approved, bytes32 reviewHash) external {
        Project storage project = projects[id];
        if (msg.sender != approver || msg.sender == project.applicant) revert Unauthorized();
        if (project.status != Status.InReview || recommendedDecision[id] != (approved ? 1 : 2) ||
            project.reviewHash != reviewHash || reviewHash == bytes32(0)) revert InvalidProject();
        project.status = approved ? Status.Approved : Status.Rejected;
        emit ProjectStatus(id, project.status, reviewHash);
    }

    function isApproved(uint256 id) public view returns (bool) {
        return projects[id].status == Status.Approved;
    }

    function isEligible(uint256 id, address account) public view returns (bool) {
        if (!isApproved(id) || account == address(0)) return false;
        return stakingVault.stakedBalance(account) >= projects[id].minimumStake;
    }

    function registerInterest(uint256 id) external {
        if (!isEligible(id, msg.sender) || interest[id][msg.sender]) revert Ineligible();
        interest[id][msg.sender] = true;
        emit InterestRegistered(id, msg.sender);
    }
}
