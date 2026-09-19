// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../intent-v1/LQCCoreIntentState.sol";
contract LQCCoreIntentStateHarness is LQCCoreIntentState {
 function register(bytes32 h,address s,uint256 n,uint256 d) external {_registerIntent(h,s,n,d);}
 function execute(bytes32 h) external {_markExecuted(h);}
 function cancel(bytes32 h) external {_cancelIntent(h,msg.sender);}
 function expire(bytes32 h) external {_markExpired(h);}
}
