// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtectedFixture,Registry,Engine} from './ProtectedFixture.sol';
contract I22RegistryUiTest is ProtectedFixture {
 function pending()internal{reg.setMarketMode(1,Registry.MarketMode.REDUCE_ONLY);}
 function testRegistrationInitialHaltedInactiveIdentity()public{uint256 id=reg.addMarket(bytes32('I22'),address(42),address(t),oracle,100000,500);(bytes32 sym,address index,address collateral,address o,uint32 lev,uint32 mm,bool active)=reg.markets(id);require(id==3&&reg.marketIdBySymbol(bytes32('I22'))==id&&sym==bytes32('I22')&&index==address(42)&&collateral==address(t)&&o==oracle&&lev==100000&&mm==500&&!active&&reg.marketMode(id)==Registry.MarketMode.HALTED);}
 function testDuplicateRegistrationRejected()public{vm.expectRevert(Registry.MarketExists.selector);reg.addMarket(bytes32('BTC'),address(42),address(t),oracle,100000,500);}
 function testInvalidMarketIdRejected()public{vm.expectRevert();reg.setRecoveryApproved(999,true);}
 function testHaltedCannotApproveOrDirectActivate()public{reg.setMarketMode(1,Registry.MarketMode.HALTED);vm.expectRevert(Registry.InvalidRecovery.selector);reg.setRecoveryApproved(1,true);vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(1,true);}
 function testReduceOnlyWithoutApprovalCannotActivate()public{pending();vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(1,true);}
 function testFreshApprovalExpiresAt900Seconds()public{pending();reg.setRecoveryApproved(1,true);(,,,,uint256 expiry)=reg.recoveryApprovals(1);require(expiry==1900);vm.warp(1900);p.set(50000e18,1900);r.set(50000e18,1900);require(!reg.recoveryApproved(1));vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(1,true);}
 function testActivationConsumesApprovalSetActive()public{pending();reg.setRecoveryApproved(1,true);reg.setMarketActive(1,true);require(!reg.recoveryApproved(1));(,,,,,,bool active)=reg.markets(1);require(active);pending();vm.expectRevert(Registry.InvalidRecovery.selector);reg.setMarketActive(1,true);}
 function testActivationViaSetMarketModeConsumes()public{pending();reg.setRecoveryApproved(1,true);reg.setMarketMode(1,Registry.MarketMode.ACTIVE);require(!reg.recoveryApproved(1));}
 function testActivationViaEmergencyOwnerConsumes()public{pending();reg.setRecoveryApproved(1,true);reg.setEmergencyMarketMode(1,Registry.MarketMode.ACTIVE);require(!reg.recoveryApproved(1));}
 function testGuardianCannotApproveOrActivate()public{pending();reg.setGuardian(B);vm.prank(B);vm.expectRevert(Registry.Forbidden.selector);reg.setRecoveryApproved(1,true);reg.setRecoveryApproved(1,true);vm.prank(B);vm.expectRevert(Registry.Forbidden.selector);reg.setEmergencyMarketMode(1,Registry.MarketMode.ACTIVE);}
 function testGuardianCanOnlyTighten()public{reg.setGuardian(B);vm.prank(B);reg.setEmergencyMarketMode(1,Registry.MarketMode.HALTED);vm.prank(B);vm.expectRevert(Registry.Forbidden.selector);reg.setEmergencyMarketMode(1,Registry.MarketMode.REDUCE_ONLY);}
 function testOracleReferenceFailureDisablesApproval()public{pending();ctrl.clearCircuitBreaker(address(42));require(!reg.liquidationReady(1));vm.expectRevert();reg.setRecoveryApproved(1,true);}
 function testLiquidationFlagOffCannotApprove()public{pending();engine.configureProtectedLiquidationCandidate(1,false);require(!reg.liquidationReady(1));vm.expectRevert(Registry.RiskUnverified.selector);reg.setRecoveryApproved(1,true);}
 function testReduceOnlyAndHaltedDenyEntry()public{pending();vm.prank(A);vm.expectRevert(Engine.MarketInactive.selector);engine.openPosition(1,1000e18,5000e18,true);reg.setMarketMode(1,Registry.MarketMode.HALTED);vm.prank(A);vm.expectRevert(Engine.MarketInactive.selector);engine.openPosition(1,1000e18,5000e18,true);}
 function testOwnerChangeInvalidatesApproval()public{pending();reg.setRecoveryApproved(1,true);reg.transferOwnership(B);vm.prank(B);reg.acceptOwnership();require(!reg.recoveryApproved(1));}
 function testEmergencySignalInvalidatesApproval()public{pending();reg.setRecoveryApproved(1,true);reg.applyEmergencyTriggers(1,true,true,true);require(!reg.recoveryApproved(1));}
 function testReduceOnlyAllowsVoluntaryPartialAndFullClose()public{_open(A,1,true,1000e18,5000e18);pending();_reduce(A,1,2500e18);(,uint256 size,,,bool open)=engine.positions(A,1);require(open&&size==2500e18);_close(A,1);(,,,,open)=engine.positions(A,1);require(!open&&engine.openInterestUsd(1)==0);_assertBooks(t);}
 function testHaltedVoluntaryCloseFollowsCurrentEnginePolicy()public{_open(A,1,true,1000e18,5000e18);reg.setMarketMode(1,Registry.MarketMode.HALTED);_close(A,1);(,,,,bool open)=engine.positions(A,1);require(!open);_assertBooks(t);}
 function testActiveEntryAfterApprovedRecovery()public{pending();reg.setRecoveryApproved(1,true);reg.setMarketActive(1,true);_open(A,1,true,1000e18,5000e18);(,uint256 size,,,bool open)=engine.positions(A,1);require(open&&size==5000e18);_assertBooks(t);}
}
