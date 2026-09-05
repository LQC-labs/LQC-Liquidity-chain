// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCFlowFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}
