// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPyth} from "../interfaces/IPyth.sol";

contract MockPyth is IPyth {
    Price private _price;

    error StalePrice();

    function setPrice(int64 price_, uint64 conf_, int32 expo_, uint256 publishTime_) external {
        _price = Price(price_, conf_, expo_, publishTime_);
    }

    function getPriceNoOlderThan(bytes32, uint256 age) external view returns (Price memory price) {
        price = _price;
        if (price.publishTime == 0 || price.publishTime > block.timestamp || block.timestamp - price.publishTime > age) {
            revert StalePrice();
        }
    }
}
