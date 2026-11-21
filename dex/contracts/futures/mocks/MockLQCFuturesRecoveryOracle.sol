// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCFuturesOracle} from "../ILQCFuturesOracle.sol";

/// @notice Test-only market-bound wrapper for existing Futures price fixtures.
contract MockLQCFuturesRecoveryOracle is ILQCFuturesOracle {
    address public immutable indexToken;
    ILQCFuturesOracle private immutable source;

    error WrongToken();

    constructor(address token_, ILQCFuturesOracle source_) {
        indexToken = token_;
        source = source_;
    }

    function getPrice(address token) external view returns (uint256 price, uint256 updatedAt) {
        if (token != indexToken) revert WrongToken();
        return source.getPrice(token);
    }
}
