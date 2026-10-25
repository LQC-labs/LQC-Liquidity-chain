// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Full precision arithmetic for the isolated LOCAL prototype. No token amounts are USD.
library SettlementMath {
    error Range();
    // EXPERIMENTAL arithmetic only. Not used by Core settlement or enabled reducePosition.
    // Reduced, bounded rationals: reject representational overflow, never approximate it.
    struct Fraction { int256 n; uint256 d; }
    function gcd(uint256 a,uint256 b) internal pure returns(uint256){while(b!=0){uint256 r=a%b;a=b;b=r;}return a;}
    function fraction(int256 n,uint256 d) internal pure returns(Fraction memory){
        if(d==0)revert Range();if(n==0)return Fraction(0,1);uint256 g=gcd(abs(n),d);return Fraction(n/int256(g),d/g);
    }
    function scaleFraction(Fraction memory f,uint256 a,uint256 b) internal pure returns(Fraction memory){
        if(b==0||f.d==0)revert Range();if(a==0||f.n==0)return Fraction(0,1);
        uint256 n=abs(f.n);uint256 g=gcd(n,b);n/=g;b/=g;g=gcd(a,f.d);a/=g;f.d/=g;
        return fraction(signed(n*a,f.n<0),f.d*b);
    }
    function addFraction(Fraction memory a,Fraction memory b) internal pure returns(Fraction memory){
        if(a.d==0||b.d==0)revert Range();uint256 g=gcd(a.d,b.d);uint256 x=b.d/g;uint256 y=a.d/g;
        return fraction(a.n*signed(x,false)+b.n*signed(y,false),a.d*x);
    }
    function experimentalLegs(uint256 q,uint256 entry,uint256 exit_,int256 fundingDelta,bool long_,uint256 collateral,uint8 dec) internal pure returns(Fraction memory pnl,Fraction memory funding,Fraction memory net){
        if(q==0||q>1e24||entry==0||entry>1e24||exit_==0||exit_>1e24||collateral==0||collateral>1e24||(dec!=6&&dec!=18)||abs(fundingDelta)>2e30)revert Range();
        int256 delta=int256(exit_)-int256(entry);if(!long_)delta=-delta;
        pnl=scaleFraction(scaleFraction(fraction(delta,entry),q,1),10**dec,collateral);
        int256 fd=long_?-fundingDelta:fundingDelta;
        funding=scaleFraction(scaleFraction(fraction(fd,1e27),q,1),10**dec,collateral);
        net=addFraction(pnl,funding);
    }
    function mulDiv(uint256 x,uint256 y,uint256 d,bool up) internal pure returns(uint256 z) {
        if(d==0) revert Range();
        uint256 rem=mulmod(x,y,d);
        unchecked {
            uint256 hi; uint256 lo;
            assembly { let mm := mulmod(x,y,not(0)) lo := mul(x,y) hi := sub(sub(mm,lo),lt(mm,lo)) }
            if(hi==0) z=lo/d;
            else {
                if(d<=hi) revert Range();
                assembly { hi := sub(hi,gt(rem,lo)) lo := sub(lo,rem) }
                uint256 twos=d & (0-d);
                assembly { d := div(d,twos) lo := div(lo,twos) twos := add(div(sub(0,twos),twos),1) }
                lo |= hi*twos;
                uint256 inv=(3*d)^2;
                inv*=2-d*inv; inv*=2-d*inv; inv*=2-d*inv;
                inv*=2-d*inv; inv*=2-d*inv; inv*=2-d*inv;
                z=lo*inv;
            }
            if(up && rem!=0) { if(z==type(uint256).max) revert Range(); z++; }
        }
    }
    function abs(int256 x) internal pure returns(uint256) {
        if(x==type(int256).min) revert Range();
        return uint256(x<0 ? -x : x);
    }
    function signed(uint256 x,bool negative) internal pure returns(int256) {
        if(x>uint256(type(int256).max)) revert Range();
        return negative ? -int256(x) : int256(x);
    }
    function usd18(uint256 raw,uint256 price18,uint8 decimals_) internal pure returns(uint256) {
        if(decimals_!=6 && decimals_!=18) revert Range();
        return mulDiv(raw,price18,10**decimals_,false);
    }
    function pnl27(uint256 size18,uint256 entry18,uint256 exit18,bool isLong) internal pure returns(int256) {
        // Arithmetic envelope, NOT a production market/price risk policy.
        if(entry18==0 || entry18>1e24 || exit18==0 || exit18>1e24 || size18>1e24) revert Range();
        bool gain=exit18>=entry18;
        uint256 delta=gain ? exit18-entry18 : entry18-exit18;
        bool negative=(gain!=isLong);
        return signed(mulDiv(size18,delta*1e9,entry18,negative),negative);
    }
    function tokens(int256 usd27,uint256 price18,uint8 decimals_) internal pure returns(int256 raw,uint256 remainder,uint256 denominator) {
        if(price18==0 || price18>1e24 || (decimals_!=6 && decimals_!=18)) revert Range();
        denominator=price18*1e9;
        uint256 magnitude=abs(usd27);
        uint256 scale=10**decimals_;
        remainder=mulmod(magnitude,scale,denominator);
        raw=signed(mulDiv(magnitude,scale,denominator,usd27<0),usd27<0);
    }

    // Cumulative gross allocation. Unassigned integer remainder stays reserved.
    function proportionalFunding(uint256 used,uint256 pnl,uint256 funding) internal pure returns(uint256 p,uint256 f,uint256 reserve){
        uint256 total=pnl+funding;if(used>total)revert Range();if(total==0)return(0,0,0);
        p=mulDiv(used,pnl,total,false);f=mulDiv(used,funding,total,false);reserve=used-p-f;
    }
}
