// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Immutable cliff plus linear vesting vault for one allocation.
/// Anyone may call release, but tokens can only go to the fixed beneficiary.
contract LQCAllocationVault {
    ILQCToken public immutable token;
    address public immutable beneficiary;
    uint64 public immutable start;
    uint64 public immutable cliff;
    uint64 public immutable duration;
    uint256 public immutable allocation;
    uint256 public released;

    event TokensReleased(address indexed beneficiary, uint256 amount);

    error InvalidSchedule();
    error NothingToRelease();
    error TransferFailed();

    constructor(
        address token_,
        address beneficiary_,
        uint64 start_,
        uint64 cliffSeconds_,
        uint64 durationSeconds_,
        uint256 allocation_
    ) {
        if (token_ == address(0) || beneficiary_ == address(0) || allocation_ == 0) revert InvalidSchedule();
        if (durationSeconds_ == 0) revert InvalidSchedule();
        token = ILQCToken(token_);
        beneficiary = beneficiary_;
        start = start_;
        cliff = start_ + cliffSeconds_;
        duration = durationSeconds_;
        allocation = allocation_;
    }

    function vestedAmount(uint64 timestamp) public view returns (uint256) {
        if (timestamp < cliff) return 0;
        uint256 elapsed = timestamp - cliff;
        if (elapsed >= duration) return allocation;
        return allocation * elapsed / duration;
    }

    function releasable() public view returns (uint256) {
        return vestedAmount(uint64(block.timestamp)) - released;
    }

    function release() external {
        uint256 amount = releasable();
        if (amount == 0) revert NothingToRelease();
        released += amount;
        if (!token.transfer(beneficiary, amount)) revert TransferFailed();
        emit TokensReleased(beneficiary, amount);
    }
}
