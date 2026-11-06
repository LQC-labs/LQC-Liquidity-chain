// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesVault as PriorVault} from './I21PriorVault.sol';
import {I21Token,Vault} from './I21Deposit.t.sol';
contract I21HistoricalTest {
 function testHistoricalFeeReceipt99Book100Deficit()public{PriorVault v=new PriorVault(address(this));I21Token t=new I21Token();t.setup(Vault(address(v)),1);t.mint(address(this),100);t.approve(address(v),100);v.setSupportedCollateral(address(t),true);v.deposit(address(t),100);require(t.realBalance(address(v))==99&&v.totalAccounted(address(t))==100&&!v.isFullyBacked(address(t)));}
 function testHistoricalEmptyReturnAccepted()public{PriorVault v=new PriorVault(address(this));I21Token t=new I21Token();t.setup(Vault(address(v)),3);t.mint(address(this),100);t.approve(address(v),100);v.setSupportedCollateral(address(t),true);v.deposit(address(t),100);require(v.totalAccounted(address(t))==100);}
}
