// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCFuturesOracle {
    /// @return price USD-style price scaled to 1e18.
    /// @return updatedAt Timestamp of the source price update.
    function getPrice(address indexToken) external view returns (uint256 price, uint256 updatedAt);
}
