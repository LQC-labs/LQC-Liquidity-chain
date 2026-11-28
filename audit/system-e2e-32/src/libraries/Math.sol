// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Math {
    function min(uint256 x, uint256 y) internal pure returns (uint256) {
        return x < y ? x : y;
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y == 0) return 0;
        z = 1;
        uint256 x = y;
        if (x >> 128 > 0) { x >>= 128; z <<= 64; }
        if (x >> 64 > 0) { x >>= 64; z <<= 32; }
        if (x >> 32 > 0) { x >>= 32; z <<= 16; }
        if (x >> 16 > 0) { x >>= 16; z <<= 8; }
        if (x >> 8 > 0) { x >>= 8; z <<= 4; }
        if (x >> 4 > 0) { x >>= 4; z <<= 2; }
        if (x >> 2 > 0) z <<= 1;
        unchecked {
            for (uint256 i; i < 7; ++i) z = (z + y / z) >> 1;
            uint256 z1 = y / z;
            if (z1 < z) z = z1;
        }
    }
}
