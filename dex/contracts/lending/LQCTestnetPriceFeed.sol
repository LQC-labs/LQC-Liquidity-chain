// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Governance-controlled Chainlink-compatible feed for BSC testnet pilots only.
contract LQCTestnetPriceFeed {
    uint8 public immutable decimals;
    address public owner;
    address public pendingOwner;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;

    event PriceUpdated(uint80 indexed roundId, int256 answer, uint256 updatedAt);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() { require(msg.sender == owner, "ONLY_OWNER"); _; }

    constructor(address owner_, uint8 decimals_, int256 initialAnswer_) {
        require(owner_ != address(0) && decimals_ <= 18 && initialAnswer_ > 0, "INVALID_CONFIG");
        owner = owner_;
        decimals = decimals_;
        _setAnswer(initialAnswer_);
    }

    function setAnswer(int256 answer_) external onlyOwner { require(answer_ > 0, "INVALID_ANSWER"); _setAnswer(answer_); }
    function transferOwnership(address nextOwner) external onlyOwner { require(nextOwner != address(0), "ZERO_OWNER"); pendingOwner = nextOwner; emit OwnershipTransferStarted(owner, nextOwner); }
    function acceptOwnership() external { require(msg.sender == pendingOwner, "ONLY_PENDING_OWNER"); address previous = owner; owner = msg.sender; pendingOwner = address(0); emit OwnershipTransferred(previous, msg.sender); }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }

    function _setAnswer(int256 answer_) private { answer = answer_; updatedAt = block.timestamp; unchecked { ++roundId; } emit PriceUpdated(roundId, answer_, updatedAt); }
}
