// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStakingRead} from "./interfaces/ILQCStakingRead.sol";
import {ILQCStakingRewardHook} from "./interfaces/ILQCStakingRewardHook.sol";

interface ILQCRewardBoundVault is ILQCStakingRead {
    function rewardController() external view returns (address);
}

/// @notice Separately funded rewards; never custodies or spends staking principal.
/// @dev 6/16 repository candidate, NOT a release or a reward-budget approval.
///      Source 0 = ecosystem allocation; source 1 = realized revenue.
///      Source labels do not prove revenue provenance; funding needs governance review.
contract LQCStakingRewards is ILQCStakingRewardHook {
    using SafeTransferLib for address;
    uint256 public constant RAY = 1e27;
    uint256 public constant MAX_LIFETIME_FUNDED = type(uint128).max;
    uint8 public constant ECOSYSTEM = 0;
    uint8 public constant REVENUE = 1;
    address public immutable override stakingVault;
    address public owner;
    address public pendingOwner;
    uint256 private unlocked = 1;

    struct Stream {
        address token;
        uint256 rate;
        uint256 finish;
        uint256 updated;
        uint256 index;
        uint256 funded;
        uint256 paid;
        uint256 refunded;
        uint256 unused;
    }
    mapping(uint8 => Stream) public streams;
    mapping(uint8 => mapping(address => uint256)) public userIndex;
    mapping(uint8 => mapping(address => uint256)) public accrued;
    mapping(uint8 => mapping(address => uint256)) public fractional;
    // Sum of both streams' outstanding budgets if they use the same reward token.
    mapping(address => uint256) public reservedByToken;

    event EpochFunded(uint8 indexed source, address indexed funder, uint256 amount, uint256 rate, uint256 finish);
    event RewardClaimed(uint8 indexed source, address indexed account, address indexed receiver, uint256 amount);
    event UnusedReturned(uint8 indexed source, address indexed receiver, uint256 amount);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    error Forbidden();
    error InvalidConfig();
    error InvalidSource();
    error ActiveEpoch();
    error NotBound();
    error NoReward();
    error InsufficientUnused();
    error UnsupportedTokenBehavior();
    error Insolvent();
    error Reentrancy();

    modifier onlyOwner() { if (msg.sender != owner) revert Forbidden(); _; }
    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address vault_, address owner_, address revenueToken_) {
        if (vault_.code.length == 0 || owner_ == address(0) || revenueToken_.code.length == 0) {
            revert InvalidConfig();
        }
        address lqc = ILQCStakingRead(vault_).asset();
        if (lqc.code.length == 0) revert InvalidConfig();
        stakingVault = vault_;
        owner = owner_;
        streams[ECOSYSTEM].token = lqc;
        streams[REVENUE].token = revenueToken_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /// @notice Funds a finite epoch from the authorized caller's existing tokens.
    /// @dev Cannot rewrite an active epoch or spend donations/principal as rewards.
    ///      No production amount, duration or APY is selected by this implementation.
    function fundEpoch(uint8 source, uint256 amount, uint64 duration) external onlyOwner nonReentrant {
        _validSource(source);
        if (ILQCRewardBoundVault(stakingVault).rewardController() != address(this)) revert NotBound();
        Stream storage s = streams[source];
        if (amount == 0 || duration == 0 || amount > MAX_LIFETIME_FUNDED - s.funded) revert InvalidConfig();
        if (block.timestamp < s.finish) revert ActiveEpoch();
        _update(source);
        uint256 rate = amount / duration;
        if (rate == 0) revert InvalidConfig();
        _solvent(s.token);
        uint256 beforeBalance = IERC20(s.token).balanceOf(address(this));
        uint256 funderBefore = IERC20(s.token).balanceOf(msg.sender);
        s.token.safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(s.token).balanceOf(address(this)) != beforeBalance + amount
            || IERC20(s.token).balanceOf(msg.sender) + amount != funderBefore) {
            revert UnsupportedTokenBehavior();
        }
        s.funded += amount;
        s.unused += amount - rate * duration;
        s.rate = rate;
        s.updated = block.timestamp;
        s.finish = block.timestamp + duration;
        reservedByToken[s.token] += amount;
        emit EpochFunded(source, msg.sender, amount, rate, s.finish);
    }

    /// @dev Only the bound vault may checkpoint before stake-weight changes.
    function checkpoint(address account) external override nonReentrant {
        if (msg.sender != stakingVault) revert Forbidden();
        _checkpoint(account);
    }

    function rewardPerToken(uint8 source) public view returns (uint256) {
        _validSource(source);
        Stream storage s = streams[source];
        uint256 until = block.timestamp < s.finish ? block.timestamp : s.finish;
        uint256 total = ILQCStakingRead(stakingVault).totalStaked();
        if (until <= s.updated || total == 0) return s.index;
        return s.index + (until - s.updated) * s.rate * RAY / total;
    }

    function earned(uint8 source, address account) external view returns (uint256) {
        uint256 delta = rewardPerToken(source) - userIndex[source][account];
        uint256 scaled = ILQCStakingRead(stakingVault).stakedBalance(account) * delta + fractional[source][account];
        return accrued[source][account] + scaled / RAY;
    }

    function claim(uint8 source, address receiver) external nonReentrant returns (uint256 amount) {
        _validSource(source);
        _validReceiver(receiver);
        _checkpoint(msg.sender);
        amount = accrued[source][msg.sender];
        if (amount == 0) revert NoReward();
        Stream storage s = streams[source];
        _solvent(s.token);
        // Effects precede token interaction. A failed/fee-charging transfer rolls back.
        accrued[source][msg.sender] = 0;
        s.paid += amount;
        reservedByToken[s.token] -= amount;
        _transferExact(s.token, receiver, amount);
        emit RewardClaimed(source, msg.sender, receiver, amount);
    }

    /// @notice Returns only never-allocated rewards after an epoch ends.
    /// @dev Previously allocated rewards (including rounding dust) remain reserved;
    ///      unclaimed earned rewards do not expire and cannot be swept by the owner.
    function returnUnused(uint8 source, uint256 amount, address receiver) external onlyOwner nonReentrant {
        _validSource(source);
        _validReceiver(receiver);
        Stream storage s = streams[source];
        if (block.timestamp < s.finish) revert ActiveEpoch();
        _update(source);
        if (amount == 0 || amount > s.unused) revert InsufficientUnused();
        _solvent(s.token);
        s.unused -= amount;
        s.refunded += amount;
        reservedByToken[s.token] -= amount;
        _transferExact(s.token, receiver, amount);
        emit UnusedReturned(source, receiver, amount);
    }

    function isRewardFullyBacked(address token) external view returns (bool) {
        return IERC20(token).balanceOf(address(this)) >= reservedByToken[token];
    }

    function _checkpoint(address account) private {
        uint256 balance = ILQCStakingRead(stakingVault).stakedBalance(account);
        for (uint8 source = 0; source < 2; ++source) {
            _update(source);
            uint256 next = streams[source].index;
            uint256 scaled = balance * (next - userIndex[source][account]) + fractional[source][account];
            accrued[source][account] += scaled / RAY;
            fractional[source][account] = scaled % RAY;
            userIndex[source][account] = next;
        }
    }

    function _update(uint8 source) private {
        Stream storage s = streams[source];
        uint256 until = block.timestamp < s.finish ? block.timestamp : s.finish;
        if (until <= s.updated) return;
        uint256 emitted = (until - s.updated) * s.rate;
        uint256 total = ILQCStakingRead(stakingVault).totalStaked();
        if (total == 0) s.unused += emitted;
        else s.index += emitted * RAY / total;
        s.updated = until;
    }

    function _transferExact(address token, address receiver, uint256 amount) private {
        uint256 fromBefore = IERC20(token).balanceOf(address(this));
        uint256 toBefore = IERC20(token).balanceOf(receiver);
        token.safeTransfer(receiver, amount);
        if (IERC20(token).balanceOf(address(this)) + amount != fromBefore
            || IERC20(token).balanceOf(receiver) != toBefore + amount) revert UnsupportedTokenBehavior();
    }

    function _solvent(address token) private view {
        if (IERC20(token).balanceOf(address(this)) < reservedByToken[token]) revert Insolvent();
    }
    function _validSource(uint8 source) private pure { if (source > REVENUE) revert InvalidSource(); }
    function _validReceiver(address receiver) private view {
        if (receiver == address(0) || receiver == address(this) || receiver == stakingVault) revert InvalidConfig();
    }
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfig();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }
}
