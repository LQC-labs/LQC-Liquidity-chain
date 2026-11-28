// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {LQCLaunchProjectRegistry} from "../launch-creator/LQCLaunchProjectRegistry.sol";

interface ILQCLaunchSalePolicy {
    function emergencyPaused() external view returns (bool);
    function bootstrapAdapter() external view returns (address);
    function projectDisabled(uint256 projectId) external view returns (bool);
}

/// @notice One project sale and its dedicated ERC-20 escrow.
contract LQCFixedPriceSale {
    using SafeTransferLib for address;

    enum Outcome { Pending, Success, Failure }

    // The price is a ratio of raw sale units to raw payment units.
    struct Terms {
        address saleToken;
        address paymentToken;
        uint128 saleUnits;
        uint128 paymentUnits;
        uint128 minimumRaise;
        uint128 maximumRaise;
        uint128 walletCap;
        uint64 opensAt;
        uint64 closesAt;
    }

    // All-zero schedule selects immediate delivery. Cliff and interval are seconds from start.
    struct Vesting {
        uint64 start;
        uint64 cliff;
        uint64 duration;
        uint64 interval;
    }

    struct ClaimView {
        uint256 contributed;
        uint256 allocated;
        uint256 paid;
        uint256 available;
        uint256 unvested;
        uint256 nextClaimAt;
        uint256 refundable;
        bool refunded;
    }

    struct Position {
        uint128 contributed;
        uint256 allocated;
        bool claimed;
        bool refunded;
    }

    bytes32 public constant SETTLEMENT_POLICY = keccak256("LQC_FIXED_PRICE_IMMEDIATE_CLAIM_V1");
    bytes32 public constant VESTING_POLICY = keccak256("LQC_FIXED_PRICE_PERIODIC_CLAIM_V2");
    uint64 public immutable vestingStart;
    uint64 public immutable vestingCliff;
    uint64 public immutable vestingDuration;
    uint64 public immutable vestingInterval;
    LQCLaunchProjectRegistry public immutable projectRegistry;
    ILQCLaunchSalePolicy public immutable policy;
    uint256 public immutable projectId;
    address public immutable applicant;
    bytes32 public immutable termsHash;
    uint256 public immutable inventoryRequired;

    Terms public terms;
    Outcome public outcome;
    bool public inventoryFunded;
    bool public cancelled;
    bool public proceedsWithdrawn;
    bool public surplusWithdrawn;

    uint256 public totalContributed;
    uint256 public totalAllocated;
    uint256 public totalClaimed;
    uint256 public totalRefunded;
    uint256 public proceedsPaid;
    uint256 public inventoryReturned;
    mapping(address => Position) public positions;
    uint256 private unlocked = 1;
    mapping(address => uint256) public claimedAmount;
    bytes32 public bootstrapApproval;
    uint256 public bootstrapReserved;
    uint256 public bootstrapSpent;

    error Unauthorized();
    error InvalidTerms();
    error InvalidState();
    error Ineligible();
    error InvalidContribution();
    error UnsupportedTransfer();
    error InsufficientBacking();
    error Reentrancy();

    event InventoryFunded(uint256 amount);
    event Contributed(address indexed participant, uint256 amount, uint256 allocationAdded);
    event Cancelled(address indexed caller);
    event Finalized(Outcome outcome, uint256 contributed, uint256 allocated);
    event Claimed(address indexed participant, uint256 amount);
    event Refunded(address indexed participant, uint256 amount);
    event ProceedsWithdrawn(address indexed applicant, uint256 amount);
    event BootstrapReserved(bytes32 indexed approval, uint256 amount);
    event BootstrapCancelled(bytes32 indexed approval);
    event BootstrapSpent(bytes32 indexed approval, uint256 amount);
    event InventoryReturned(address indexed applicant, uint256 amount);

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(LQCLaunchProjectRegistry registry_, uint256 projectId_, address applicant_, Terms memory terms_, Vesting memory schedule) {
        if (terms_.saleToken == terms_.paymentToken || terms_.saleToken.code.length == 0 ||
            terms_.paymentToken.code.length == 0 || terms_.saleUnits == 0 || terms_.paymentUnits == 0 ||
            terms_.minimumRaise == 0 || terms_.minimumRaise > terms_.maximumRaise ||
            terms_.walletCap == 0 || terms_.walletCap > terms_.maximumRaise ||
            terms_.opensAt <= block.timestamp || terms_.closesAt <= terms_.opensAt ||
            _allocation(terms_.walletCap, terms_) == 0) revert InvalidTerms();
        if (schedule.duration == 0) {
            if (schedule.start != 0 || schedule.cliff != 0 || schedule.interval != 0) revert InvalidTerms();
        } else if (schedule.start < terms_.closesAt || schedule.cliff > schedule.duration ||
            schedule.interval == 0 || schedule.interval > schedule.duration ||
            uint256(schedule.start) + schedule.duration > type(uint64).max) revert InvalidTerms();
        vestingStart = schedule.start;
        vestingCliff = schedule.cliff;
        vestingDuration = schedule.duration;
        vestingInterval = schedule.interval;
        projectRegistry = registry_;
        policy = ILQCLaunchSalePolicy(msg.sender);
        projectId = projectId_;
        applicant = applicant_;
        terms = terms_;
        inventoryRequired = _allocation(terms_.maximumRaise, terms_);
        termsHash = schedule.duration == 0
            ? keccak256(abi.encode(block.chainid, address(this), msg.sender,
                address(registry_), projectId_, applicant_, SETTLEMENT_POLICY, terms_))
            : keccak256(abi.encode(block.chainid, address(this), msg.sender,
                address(registry_), projectId_, applicant_, VESTING_POLICY, terms_, schedule));
    }

    function fundInventory() external nonReentrant {
        if (!_isOperator()) revert Unauthorized();
        if (outcome != Outcome.Pending || cancelled || inventoryFunded || block.timestamp >= terms.opensAt ||
            _disabled()) revert InvalidState();
        inventoryFunded = true;
        _pull(terms.saleToken, applicant, inventoryRequired);
        emit InventoryFunded(inventoryRequired);
    }

    function contribute(uint128 amount) external nonReentrant {
        Terms memory config = terms;
        if (outcome != Outcome.Pending || cancelled || !inventoryFunded || policy.emergencyPaused() || _disabled() ||
            block.timestamp < config.opensAt || block.timestamp >= config.closesAt) revert InvalidState();
        if (msg.sender == applicant || _isOperator() || !projectRegistry.isEligible(projectId, msg.sender)) revert Ineligible();
        Position storage position = positions[msg.sender];
        uint256 newContribution = uint256(position.contributed) + amount;
        if (amount == 0 || newContribution > config.walletCap ||
            totalContributed + amount > config.maximumRaise) revert InvalidContribution();
        uint256 allocation = _allocation(newContribution, config);
        uint256 additional = allocation - position.allocated;
        if (additional == 0) revert InvalidContribution();
        _assertBacking();
        position.contributed = uint128(newContribution);
        position.allocated = allocation;
        totalContributed += amount;
        totalAllocated += additional;
        _pull(config.paymentToken, msg.sender, amount);
        emit Contributed(msg.sender, amount, additional);
    }

    function cancel() external nonReentrant {
        // Applicant cancellation is available before opening. A reviewer may stop a live sale.
        if (msg.sender != projectRegistry.reviewer() &&
            (!_isOperator() || block.timestamp >= terms.opensAt)) revert Unauthorized();
        if (outcome != Outcome.Pending || cancelled || block.timestamp >= terms.closesAt) revert InvalidState();
        cancelled = true;
        emit Cancelled(msg.sender);
    }

    function finalize() external nonReentrant {
        if (outcome != Outcome.Pending) revert InvalidState();
        bool forcedFailure = cancelled || _disabled();
        if (!forcedFailure && block.timestamp < terms.closesAt) revert InvalidState();
        if (forcedFailure || totalContributed < terms.minimumRaise) {
            outcome = Outcome.Failure;
        } else {
            _assertBacking();
            outcome = Outcome.Success;
        }
        emit Finalized(outcome, totalContributed, totalAllocated);
    }

    function claim() external nonReentrant {
        Position storage position = positions[msg.sender];
        if (outcome != Outcome.Success || position.claimed || position.allocated == 0) revert InvalidState();
        uint256 vested = _vested(position.allocated, block.timestamp);
        uint256 amount = vested - claimedAmount[msg.sender];
        if (amount == 0) revert InvalidState();
        _assertTokenBacking(terms.saleToken, saleBalanceRequired());
        claimedAmount[msg.sender] = vested;
        position.claimed = vested == position.allocated;
        totalClaimed += amount;
        _push(terms.saleToken, msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function claimStatus(address account) external view returns (ClaimView memory status) {
        Position storage position = positions[account];
        status.contributed = position.contributed;
        status.allocated = position.allocated;
        status.paid = claimedAmount[account];
        status.refunded = position.refunded;
        if (outcome == Outcome.Failure && !position.refunded) status.refundable = position.contributed;
        if (outcome != Outcome.Success || position.claimed || position.allocated == 0) return status;

        uint256 vested = _vested(position.allocated, block.timestamp);
        status.available = vested - status.paid;
        status.unvested = position.allocated - vested;
        if (status.available != 0) {
            status.nextClaimAt = block.timestamp;
        } else {
            uint256 low = block.timestamp + 1;
            uint256 high = uint256(vestingStart) + vestingDuration;
            // Find the first timestamp at which this account's rounded entitlement actually increases.
            while (low < high) {
                uint256 midpoint = (low + high) / 2;
                if (_vested(position.allocated, midpoint) > status.paid) high = midpoint;
                else low = midpoint + 1;
            }
            status.nextClaimAt = low;
        }
    }

    function _vested(uint256 allocation, uint256 timestamp) private view returns (uint256) {
        uint256 duration = vestingDuration;
        if (duration == 0 || timestamp >= uint256(vestingStart) + duration) return allocation;
        if (timestamp < uint256(vestingStart) + vestingCliff) return 0;
        uint256 elapsed = (timestamp - vestingStart) / vestingInterval * vestingInterval;
        // Decomposed multiplication supports the full allocation range without overflow.
        return allocation / duration * elapsed + allocation % duration * elapsed / duration;
    }

    function refund() external nonReentrant {
        Position storage position = positions[msg.sender];
        if (outcome != Outcome.Failure || position.refunded || position.contributed == 0) revert InvalidState();
        _assertTokenBacking(terms.paymentToken, paymentBalanceRequired());
        position.refunded = true;
        uint256 amount = position.contributed;
        totalRefunded += amount;
        _push(terms.paymentToken, msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    function withdrawProceeds() external nonReentrant {
        if (policy.emergencyPaused()) revert InvalidState();
        if (!_isOperator()) revert Unauthorized();
        uint256 amount = paymentBalanceRequired() - bootstrapReserved;
        if (outcome != Outcome.Success || amount == 0) revert InvalidState();
        _assertBacking();
        proceedsWithdrawn = true;
        proceedsPaid += amount;
        _push(terms.paymentToken, applicant, amount);
        emit ProceedsWithdrawn(applicant, amount);
    }

    modifier onlyBootstrapAdapter() {
        if (msg.sender != policy.bootstrapAdapter()) revert Unauthorized();
        _;
    }

    function reserveBootstrap(bytes32 approval, uint256 amount) external nonReentrant onlyBootstrapAdapter {
        if (policy.emergencyPaused()) revert InvalidState();
        if (outcome != Outcome.Success || _disabled() || bootstrapApproval != bytes32(0) ||
            approval == bytes32(0) || amount == 0 || amount > paymentBalanceRequired()) revert InvalidState();
        _assertBacking();
        bootstrapApproval = approval;
        bootstrapReserved = amount;
        emit BootstrapReserved(approval, amount);
    }

    function cancelBootstrap(bytes32 approval) external nonReentrant onlyBootstrapAdapter {
        if (approval == bytes32(0) || approval != bootstrapApproval) revert InvalidState();
        delete bootstrapApproval;
        delete bootstrapReserved;
        emit BootstrapCancelled(approval);
    }

    function spendBootstrap(bytes32 approval) external nonReentrant onlyBootstrapAdapter {
        if (policy.emergencyPaused()) revert InvalidState();
        if (outcome != Outcome.Success || _disabled() || approval == bytes32(0) || approval != bootstrapApproval) {
            revert InvalidState();
        }
        _assertBacking();
        uint256 amount = bootstrapReserved;
        delete bootstrapApproval;
        delete bootstrapReserved;
        bootstrapSpent += amount;
        _push(terms.paymentToken, msg.sender, amount);
        emit BootstrapSpent(approval, amount);
    }

    function withdrawSurplusInventory() external nonReentrant {
        if (policy.emergencyPaused()) revert InvalidState();
        if (!_isOperator()) revert Unauthorized();
        if (outcome == Outcome.Pending || surplusWithdrawn || !inventoryFunded) revert InvalidState();
        uint256 amount = inventoryRequired - (outcome == Outcome.Success ? totalAllocated : 0);
        if (amount == 0) revert InvalidState();
        _assertTokenBacking(terms.saleToken, saleBalanceRequired());
        surplusWithdrawn = true;
        inventoryReturned = amount;
        _push(terms.saleToken, applicant, amount);
        emit InventoryReturned(applicant, amount);
    }

    function paymentBalanceRequired() public view returns (uint256) {
        return totalContributed - totalRefunded - proceedsPaid - bootstrapSpent;
    }

    function saleBalanceRequired() public view returns (uint256) {
        return inventoryFunded ? inventoryRequired - totalClaimed - inventoryReturned : 0;
    }

    function _isOperator() private view returns (bool) {
        address operator = projectRegistry.saleOperator(projectId);
        return msg.sender == (operator == address(0) ? applicant : operator);
    }

    function _disabled() private view returns (bool) {
        return policy.projectDisabled(projectId) || !projectRegistry.isApproved(projectId);
    }

    function _allocation(uint256 payment, Terms memory config) private pure returns (uint256) {
        return payment * config.saleUnits / config.paymentUnits;
    }

    function _assertBacking() private view {
        _assertTokenBacking(terms.saleToken, saleBalanceRequired());
        _assertTokenBacking(terms.paymentToken, paymentBalanceRequired());
    }

    function _assertTokenBacking(address token, uint256 required) private view {
        if (IERC20(token).balanceOf(address(this)) < required) revert InsufficientBacking();
    }

    function _pull(address token, address from, uint256 amount) private {
        IERC20 asset = IERC20(token);
        uint256 fromBefore = asset.balanceOf(from);
        uint256 balanceBefore = asset.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (asset.balanceOf(address(this)) != balanceBefore + amount ||
            asset.balanceOf(from) != fromBefore - amount) revert UnsupportedTransfer();
    }

    function _push(address token, address to, uint256 amount) private {
        IERC20 asset = IERC20(token);
        uint256 toBefore = asset.balanceOf(to);
        uint256 balanceBefore = asset.balanceOf(address(this));
        token.safeTransfer(to, amount);
        if (asset.balanceOf(address(this)) != balanceBefore - amount ||
            asset.balanceOf(to) != toBefore + amount) revert UnsupportedTransfer();
    }
}
