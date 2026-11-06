// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract FuturesMathModule {
 uint256 constant FUNDING_RAY=1e27;error FundingOverflow();
 function funding(uint256 size,bool isLong,int256 previous,bool configured,int256 cumulative,int256 entry) external pure returns(int256 payment,int256 remainder){
        int256 ray=int256(FUNDING_RAY);
        if(previous<=-ray||previous>=ray) revert FundingOverflow();
        
        if(!configured)return(0,previous);
        int256 delta=cumulative-entry;
        if(delta==type(int256).min)revert FundingOverflow();
        uint256 absDelta=uint256(delta<0?-delta:delta);
        if(size!=0&&absDelta>type(uint256).max/size)revert FundingOverflow();
        uint256 product=size*absDelta;
        uint256 magnitude=product/FUNDING_RAY;
        if(magnitude>uint256(type(int256).max))revert FundingOverflow();
        bool receives=(delta>0&&!isLong)||(delta<0&&isLong);
        payment=receives?int256(magnitude):-int256(magnitude);
        int256 fraction=int256(product%FUNDING_RAY);
        int256 combined=previous+(receives?fraction:-fraction);
        payment+=combined/ray;
        remainder=combined%ray;
        // Canonical signed quotient/remainder of the combined exact numerator.
        if(payment>0&&remainder<0){payment-=1;remainder+=ray;}
        else if(payment<0&&remainder>0){payment+=1;remainder-=ray;}}
 function pnl(uint256 size,uint256 entry,bool isLong,uint256 price)external pure returns(int256){if(isLong)return(int256(price)-int256(entry))*int256(size)/int256(entry);return(int256(entry)-int256(price))*int256(size)/int256(entry);}
}
