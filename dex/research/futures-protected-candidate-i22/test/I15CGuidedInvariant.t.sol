// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {I15CHandler} from './I15CFundingInvariant.t.sol';
contract I15CGuidedInvariantTest {
 struct FuzzSelector{address addr;bytes4[] selectors;}
 event log_named_uint(string key,uint256 val);
 I15CHandler public handler;
 function setUp()public{handler=new I15CHandler();handler.setUp();for(uint256 i;i<20;i++)handler.actFunding(0,6,false);handler.actPrice(2);handler.actLiquidate(0,0);require(handler.liquidations()==1,'guided BTC liquidation absent');for(uint256 i;i<30;i++)handler.actFunding(1,6,false);handler.actLiquidate(0,1);require(handler.liquidations()==2,'guided ETH liquidation absent');emit log_named_uint('guidedSetupActions',53);}
 function targetContracts()external view returns(address[]memory a){a=new address[](1);a[0]=address(handler);}
 function targetSelectors()external view returns(FuzzSelector[]memory a){a=new FuzzSelector[](1);bytes4[]memory s=new bytes4[](13);s[0]=I15CHandler.actFunding.selector;s[1]=I15CHandler.actPrice.selector;s[2]=I15CHandler.actSettle.selector;s[3]=I15CHandler.actLiquidate.selector;s[4]=I15CHandler.actReduce.selector;s[5]=I15CHandler.actReenter.selector;s[6]=I15CHandler.actClaim.selector;s[7]=I15CHandler.actWithdraw.selector;s[8]=I15CHandler.actDeposit.selector;s[9]=I15CHandler.actReservation.selector;s[10]=I15CHandler.actBlockedAdl.selector;s[11]=I15CHandler.actFault.selector;s[12]=I15CHandler.actRepay.selector;a[0]=FuzzSelector(address(handler),s);}
 function invariant_referenceFundingCustodyAndOi()public view{handler.checkAll();}
 function afterInvariant()public{require(handler.actions()>0,'vacuous campaign');handler.checkAll();emit log_named_uint('actions',handler.actions());emit log_named_uint('accepted',handler.accepted());emit log_named_uint('rejected',handler.rejected());emit log_named_uint('liquidations',handler.liquidations());emit log_named_uint('claimsPaid',handler.claimsPaid());emit log_named_uint('reentries',handler.reentries());emit log_named_uint('repayments',handler.successes(12));emit log_named_uint('endDebt',handler.endDebt());emit log_named_uint('endPayable',handler.endPayable());emit log_named_uint('endReceivable',handler.endReceivable());}
}
