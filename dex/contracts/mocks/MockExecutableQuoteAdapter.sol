// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ILQCExecutionAdapter} from "../router-v2/interfaces/ILQCExecutionAdapter.sol";
contract MockExecutableQuoteAdapter is ILQCExecutionAdapter {
 uint256 public numerator; uint256 public denominator; bool public quoteFailure;
 constructor(uint256 n,uint256 d){numerator=n;denominator=d;}
 function setQuoteFailure(bool v) external {quoteFailure=v;}
 function quoteExactInput(address,address,uint256 amountIn,bytes calldata) external view returns(uint256){require(!quoteFailure,"quote failure");return amountIn*numerator/denominator;}
 function supportsExecution() external pure returns(bool){return true;}
 function executeExactInput(address,address,uint256,uint256,address,uint256,bytes calldata) external pure returns(uint256){revert("quote mock");}
}