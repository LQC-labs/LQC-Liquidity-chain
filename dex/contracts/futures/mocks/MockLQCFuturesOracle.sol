// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCFuturesOracle} from "../ILQCFuturesOracle.sol";

/// @notice Test-only oracle for LQC Flow Futures.
contract MockLQCFuturesOracle is ILQCFuturesOracle {
    struct PriceData { uint256 price; uint256 updatedAt; }
    mapping(address => PriceData) public prices;

    function setPrice(address token, uint256 price) external {
        prices[token] = PriceData(price, block.timestamp);
    }

    function setPriceWithTimestamp(address token, uint256 price, uint256 updatedAt) external {
        prices[token] = PriceData(price, updatedAt);
    }

    function getPrice(address token) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory data = prices[token];
        return (data.price, data.updatedAt);
    }
}
