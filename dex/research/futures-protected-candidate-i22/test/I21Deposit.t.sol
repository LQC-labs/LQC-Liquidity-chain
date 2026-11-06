// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LQCFuturesVault as Vault} from '../src/LQCFuturesVault.sol';
interface VmI21 {function prank(address)external;function expectRevert()external;function expectRevert(bytes4)external;function etch(address,bytes calldata)external;}
// Deliberately adversarial laboratory token, NEVER an approved collateral implementation.
contract I21Token {
 mapping(address=>uint256) public realBalance;mapping(address=>mapping(address=>uint256))public allowance;
 uint256 public mode;uint256 public calls;uint256 public fake;bool public callbackBlocked;Vault public target;
 function setup(Vault v,uint256 m)external{target=v;mode=m;}
 function mint(address a,uint256 n)external{realBalance[a]+=n;}
 function burn(address a,uint256 n)external{realBalance[a]-=n;}
 function balanceOf(address a)external view returns(uint256){if(mode==12)revert('balance failure');return realBalance[a]+(a==address(target)?fake:0);}
 function approve(address a,uint256 n)external returns(bool){allowance[msg.sender][a]=n;return true;}
 function transfer(address b,uint256 n)external returns(bool){realBalance[msg.sender]-=n;realBalance[b]+=n;return true;}
 function transferFrom(address a,address b,uint256 n)external returns(bool){
  calls++;allowance[a][msg.sender]-=n;realBalance[a]-=n;
  if(mode==1)realBalance[b]+=n-1;
  else if(mode==6)realBalance[b]+=n+1;
  else if(mode==7){realBalance[b]+=n;realBalance[b]-=1;}
  else if(mode==11){fake+=n;} // lies about custody; demonstrates receipt-only limitation
  else if(mode==13){realBalance[a]+=n;realBalance[address(0xb)]-=n;realBalance[b]+=n;}
  else realBalance[b]+=n;
  if(mode==2)return false;
  if(mode==3){assembly("memory-safe"){return(0,0)}}
  if(mode==4){assembly("memory-safe"){mstore(0,1)return(31,1)}}
  if(mode==5){assembly("memory-safe"){mstore(0,2)return(0,32)}}
  if(mode==8){target.deposit(address(this),1);}
  if(mode==9){(bool ok,)=address(target).call(abi.encodeWithSelector(Vault.deposit.selector,address(this),1));callbackBlocked=!ok;}
  if(mode==10){assembly("memory-safe"){mstore(0,1)mstore(32,1)return(0,64)}}
  return true;
 }
}
contract I21DepositTest {
 VmI21 constant vm=VmI21(address(uint160(uint256(keccak256('hevm cheat code')))));
 Vault v;I21Token t;address constant B=address(0xb);
 function setUp()public{v=new Vault(address(this));v.setEngine(address(this));t=new I21Token();t.setup(v,0);t.mint(address(this),1000);t.approve(address(v),type(uint256).max);v.setSupportedCollateral(address(t),true);}
 function digest()internal view returns(bytes32){return keccak256(abi.encode(t.realBalance(address(this)),t.realBalance(address(v)),t.allowance(address(this),address(v)),t.calls(),t.fake(),v.availableBalance(address(this),address(t)),v.totalAccounted(address(t)),v.fundingPoolBalance(address(t)),v.lockedBalance(address(this),address(t)),v.insuranceFeeReserve(address(t)),v.treasuryFeeReserve(address(t)),v.residualBadDebt(address(t))));}
 function rejected(uint256 m)internal{t.setup(v,m);bytes32 h=digest();if(m==1||m==6||m==7)vm.expectRevert(Vault.DepositReceiptMismatch.selector);else if(m==12)vm.expectRevert();else vm.expectRevert(Vault.InvalidDepositToken.selector);v.deposit(address(t),100);require(digest()==h,'atomic rollback');}
 function testStandard100ReceiptAndBook100()public{v.deposit(address(t),100);require(t.realBalance(address(v))==100&&v.availableBalance(address(this),address(t))==100&&v.totalAccounted(address(t))==100&&v.isFullyBacked(address(t)));}
 function testFee100Receipt99Reverts()public{rejected(1);}
 function testFalseReturnReverts()public{rejected(2);}
 function testEmptyReturnReverts()public{rejected(3);}
 function testShortReturnReverts()public{rejected(4);}
 function testNonCanonicalBooleanReverts()public{rejected(5);}
 function testPositiveRebaseDuringTransferReverts()public{rejected(6);}
 function testNegativeBalanceChangeDuringTransferReverts()public{rejected(7);}
 function testUncaughtCallbackRevertsAll()public{rejected(8);}
 function testCaughtReentryCannotCreateSecondDeposit()public{t.setup(v,9);v.deposit(address(t),100);require(t.callbackBlocked()&&t.calls()==1&&v.totalAccounted(address(t))==100);}
 function testOversizedReturnReverts()public{rejected(10);}
 function testBalanceGetterFailureReverts()public{rejected(12);}
 function testEOAAllowlistedStillRejected()public{v.setSupportedCollateral(B,true);vm.expectRevert(Vault.InvalidDepositToken.selector);v.deposit(B,100);}
 function testUnlistedTokenRejected()public{v.setSupportedCollateral(address(t),false);vm.expectRevert(Vault.UnsupportedCollateral.selector);v.deposit(address(t),100);}
 function testZeroRejected()public{vm.expectRevert(Vault.InvalidAmount.selector);v.deposit(address(t),0);}
 function testRepeatedDepositsPartialWithdrawal()public{v.deposit(address(t),100);v.deposit(address(t),100);v.withdraw(address(t),75);require(v.availableBalance(address(this),address(t))==125&&t.realBalance(address(v))==125&&v.totalAccounted(address(t))==125);}
 function testDirectDonationIsNotBookCredit()public{t.transfer(address(v),25);require(v.totalAccounted(address(t))==0);v.deposit(address(t),100);require(v.totalAccounted(address(t))==100&&t.realBalance(address(v))==125);}
 function testUnlistedDirectTransferDoesNotCreateClaims()public{v.setSupportedCollateral(address(t),false);t.transfer(address(v),100);require(v.availableBalance(address(this),address(t))==0&&v.totalAccounted(address(t))==0);}
 function testPreexistingDeficitRejectsNewDeposit()public{v.deposit(address(t),100);t.burn(address(v),1);bytes32 h=digest();vm.expectRevert(Vault.InsufficientVaultLiquidity.selector);v.deposit(address(t),100);require(digest()==h);}
 function testRejectedDepositPreservesExistingLockedAndPool()public{v.deposit(address(t),200);v.lockCollateral(address(this),address(t),50);v.settleFunding(address(this),address(t),-20);rejected(1);require(v.lockedBalance(address(this),address(t))==50&&v.fundingPoolBalance(address(t))==20);}
 function testDonationsCannotHideShortReceipt()public{t.transfer(address(v),100);rejected(1);}
 function testSuccessfulDepositAfterRevertLockRestored()public{rejected(1);t.setup(v,0);v.deposit(address(t),100);require(v.totalAccounted(address(t))==100);}
 function testMultipleUsersNoCrossCredit()public{v.deposit(address(t),100);t.mint(B,100);vm.prank(B);t.approve(address(v),100);vm.prank(B);v.deposit(address(t),100);require(v.availableBalance(B,address(t))==100&&v.availableBalance(address(this),address(t))==100&&v.totalAccounted(address(t))==200);}
 function testFuzzStandardExactReceipt(uint128 amount)public{if(amount==0)return;t.mint(address(this),amount);v.deposit(address(t),amount);require(v.totalAccounted(address(t))==amount&&t.realBalance(address(v))==amount);}
 // Negative assurance: PASS means an identified unsupported attack remains possible if governance allowlists this token.
 function testLimitationLyingBalanceCanSpoofReceipt()public{t.setup(v,11);v.deposit(address(t),100);require(v.totalAccounted(address(t))==100&&t.realBalance(address(v))==0,'expected unsupported attack demonstration');}
 function testLimitationLaterRebaseCanBreakBacking()public{v.deposit(address(t),100);t.burn(address(v),1);require(!v.isFullyBacked(address(t)));}
 function testLimitationStableCodeHashDoesNotProveHonestBalance()public{bytes32 hash=address(t).codehash;t.setup(v,11);require(address(t).codehash==hash);v.deposit(address(t),100);require(t.realBalance(address(v))==0&&v.totalAccounted(address(t))==100);}
 function testLimitationReceiptCannotProveSourceOfAssets()public{t.mint(B,100);t.setup(v,13);v.deposit(address(t),100);require(t.realBalance(B)==0&&t.realBalance(address(this))==1000&&v.availableBalance(address(this),address(t))==100);}
 function testOwnerOnlyAllowlist()public{vm.prank(B);vm.expectRevert(Vault.Forbidden.selector);v.setSupportedCollateral(address(t),false);}
 function testRemovedTokenCodeRejectedDespiteAllowlist()public{vm.etch(address(t),hex"");require(v.supportedCollateral(address(t)));vm.expectRevert(Vault.InvalidDepositToken.selector);v.deposit(address(t),100);require(v.totalAccounted(address(t))==0);}
}
