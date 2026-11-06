// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
library LedgerMath {
    /// Exact floor(a*b/d), for allocation domain a<=d and b<=d.
    /// Fast common path, then bounded binary division without an overflowing product.
    function proportion(uint256 a,uint256 b,uint256 d) internal pure returns(uint256 q){
        require(d!=0&&a<=d&&b<=d,'allocation domain');
        if(a==0||b==0)return 0;if(a==d)return b;if(b==d)return a;
        if(a<=type(uint256).max/b)return a*b/d;
        uint256 r;
        for(uint256 i=256;i!=0;){
            unchecked{--i;}
            uint256 carry;
            if(r>=d-r){r-=d-r;carry=1;}else r+=r;
            if((a>>i)&1!=0){if(r>=d-b){r-=d-b;carry+=1;}else r+=b;}
            q=q*2+carry;
        }
    }
}
