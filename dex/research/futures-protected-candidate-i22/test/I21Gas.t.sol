// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesVault as PriorVault} from './I21PriorVault.sol';
import {I21Token,Vault} from './I21Deposit.t.sol';
contract I21GasTest {
 event log_named_uint(string key,uint256 value);
 function testMatchedDepositGasBeforeAfter()public{
  PriorVault oldV=new PriorVault(address(this));Vault newV=new Vault(address(this));I21Token oldT=new I21Token();I21Token newT=new I21Token();oldT.setup(Vault(address(oldV)),0);newT.setup(newV,0);oldT.mint(address(this),200);newT.mint(address(this),200);oldT.approve(address(oldV),200);newT.approve(address(newV),200);oldV.setSupportedCollateral(address(oldT),true);newV.setSupportedCollateral(address(newT),true);
  uint256 g=gasleft();oldV.deposit(address(oldT),100);uint256 beforeGas=g-gasleft();g=gasleft();newV.deposit(address(newT),100);uint256 afterGas=g-gasleft();emit log_named_uint('I19 first deposit call gas',beforeGas);emit log_named_uint('I21 first deposit call gas',afterGas);
  g=gasleft();oldV.deposit(address(oldT),100);beforeGas=g-gasleft();g=gasleft();newV.deposit(address(newT),100);afterGas=g-gasleft();emit log_named_uint('I19 repeated deposit call gas',beforeGas);emit log_named_uint('I21 repeated deposit call gas',afterGas);require(oldV.totalAccounted(address(oldT))==newV.totalAccounted(address(newT)));
 }
}
