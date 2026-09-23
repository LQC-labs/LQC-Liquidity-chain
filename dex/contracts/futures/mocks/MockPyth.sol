// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPyth} from "../interfaces/IPyth.sol";

contract MockPyth is IPyth {
    Price private _price;
    uint256 public updateFee;
    uint256 public updateCalls;
    uint256 public lastValue;

    error StalePrice();

    function setUpdateFee(uint256 fee_) external {
        updateFee = fee_;
    }

    function setPrice(int64 price_, uint64 conf_, int32 expo_, uint256 publishTime_) external {
        _price = Price(price_, conf_, expo_, publishTime_);
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256 feeAmount) {
        return updateFee;
    }

    function updatePriceFeeds(bytes[] calldata updateData) external payable {
        require(updateData.length != 0, "empty");
        require(msg.value == updateFee, "fee");
        updateCalls += 1;
        lastValue = msg.value;
    }

    function getPriceNoOlderThan(bytes32, uint256 age) external view returns (Price memory price) {
        price = _price;
        if (price.publishTime == 0 || price.publishTime > block.timestamp || block.timestamp - price.publishTime > age) {
            revert StalePrice();
        }
    }
}
