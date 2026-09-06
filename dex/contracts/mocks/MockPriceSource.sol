// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCPriceSource} from "../interfaces/ILQCPriceSource.sol";

contract MockPriceSource is ILQCPriceSource {
    uint256 public price;
    uint256 public updatedAt;
    bool public shouldRevert;

    function setPrice(uint256 price_, uint256 updatedAt_) external {
        price = price_;
        updatedAt = updatedAt_;
    }

    function setShouldRevert(bool value) external { shouldRevert = value; }

    function latestPrice(address) external view returns (uint256, uint256) {
        if (shouldRevert) revert();
        return (price, updatedAt);
    }
}
