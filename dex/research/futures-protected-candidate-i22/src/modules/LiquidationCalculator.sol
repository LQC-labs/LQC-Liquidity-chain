// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// Calculation only. No authority, storage, asset calls, or Ledger writes.

interface ILiqEngine {function positions(address,uint256)external view returns(uint256,uint256,uint256,bool,bool);function registry()external view returns(address);function vault()external view returns(address);function fundingLedger()external view returns(address);function fundingRemainderRay(address,uint256,address)external view returns(int256);function fundingWithdrawalRequirement(address,address)external view returns(uint256);function liquidationReductionBps(uint256)external view returns(uint256);function liquidationMinRemainingSizeUsd(uint256)external view returns(uint256);}
interface ILiqRegistry {function marketMode(uint256)external view returns(uint8);function riskEngine()external view returns(address);function riskVault()external view returns(address);function verifiedResidualDebt(uint256)external view returns(bool,uint256);function marketCount()external view returns(uint256);function recoveryApproved(uint256)external view returns(bool);function markets(uint256)external view returns(bytes32,address,address,address,uint32,uint32,bool);}
interface ILiqLedger {function payableAmount(bytes32)external view returns(uint256);}
interface ILiqVault {function availableBalance(address,address)external view returns(uint256);function otherReservedCollateral(address,address)external view returns(uint256);}

contract LiquidationCalculator {
 error InvalidAmount();error FundingOverflow();
 function reduction(uint256 size,uint256 bps,uint256 minimum)public pure returns(uint256 n){if(bps==0)return size;if(size>type(uint256).max/bps)revert InvalidAmount();n=size*bps/10000;if(n==0||n>=size)return size;if(minimum!=0&&size-n<minimum)return size;}
 function legacyCoverage(uint256 margin,uint256 available,int256 payment,uint256 bps)external pure returns(uint256){if(payment>=0)return 0;uint256 debit=uint256(-payment);if(available>type(uint256).max-margin)revert InvalidAmount();uint256 collectible=margin+available;uint256 shortfall=debit>collectible?debit-collectible:0;if(bps!=0&&shortfall>type(uint256).max/bps)revert InvalidAmount();return shortfall*bps/10000;}
 function validateLegacyReceipt(int256 payment,uint256 credit,uint256 marginDebit,uint256 covered,uint256 residual)external pure returns(uint256 availableDebit){if(payment>0){if(credit!=uint256(payment)||marginDebit!=0||covered!=0||residual!=0)revert FundingOverflow();}else{uint256 debt=uint256(-payment);if(credit!=0||covered>debt||residual>debt-covered)revert FundingOverflow();uint256 userDebit=debt-covered-residual;if(marginDebit>userDebit)revert FundingOverflow();return userDebit-marginDebit;}}
 /// New-policy quote only: PnL/maintenance/other reservations first; NO Funding insurance/debt transfer.
 function fundingEligibility(uint256 available,uint256 otherReserved,uint256 pnlAvailableReserve,uint256 ownMargin,uint256 pnlMarginReserve,uint256 maintenance,uint256 payable_)public pure returns(uint256 fromAvailable,uint256 fromOwnMargin,uint256 unpaid){if(otherReserved>available||pnlAvailableReserve>available-otherReserved||pnlMarginReserve>ownMargin||maintenance>ownMargin-pnlMarginReserve)revert InvalidAmount();uint256 a=available-otherReserved-pnlAvailableReserve;uint256 m=ownMargin-pnlMarginReserve-maintenance;fromAvailable=payable_<a?payable_:a;uint256 left=payable_-fromAvailable;fromOwnMargin=left<m?left:m;unpaid=left-fromOwnMargin;}

 function requireCandidateChange(address engine,uint256 market)external view{ILiqRegistry reg=ILiqRegistry(ILiqEngine(engine).registry());if(market==0||market>reg.marketCount()||reg.marketMode(market)==0||reg.recoveryApproved(market))revert FundingProtectionInvalid();}
 error NotLiquidatable();error MarketInactive();error FundingProtectionInvalid();
 struct Plan{uint256 reduce;uint256 remainingSize;uint256 remainingMargin;int256 pnl;bool full;}
 function requireProtectedSource(address engine,uint256 market)external view{ILiqEngine e=ILiqEngine(engine);ILiqRegistry reg=ILiqRegistry(e.registry());if(reg.marketMode(market)>1)revert MarketInactive();try reg.verifiedResidualDebt(market) returns(bool ok,uint256){if(!ok||reg.riskEngine()!=engine||reg.riskVault()!=e.vault())revert FundingProtectionInvalid();}catch{revert FundingProtectionInvalid();}}
 function _pnl(uint256 size,uint256 entry,bool isLong,uint256 price)private pure returns(int256){return isLong?(int256(price)-int256(entry))*int256(size)/int256(entry):(int256(entry)-int256(price))*int256(size)/int256(entry);}
 function liquidationPlan(address engine,address account,uint256 market,uint256 price,bool protected_)external view returns(Plan memory p){
  ILiqEngine e=ILiqEngine(engine);(uint256 margin,uint256 size,uint256 entry,bool isLong,)=e.positions(account,market);(,,address token,,,uint32 maintenance,)=ILiqRegistry(e.registry()).markets(market);
  int256 fullPnl=_pnl(size,entry,isLong,price);uint256 maint=size*uint256(maintenance)/10000;
  if(protected_){uint256 due=ILiqLedger(e.fundingLedger()).payableAmount(keccak256(abi.encode(account,market,token)));bool negative=e.fundingRemainderRay(account,market,token)<0;uint256 equity;if(fullPnl>=0)equity=margin+uint256(fullPnl);else{if(fullPnl==type(int256).min)revert InvalidAmount();uint256 loss=uint256(-fullPnl);equity=loss<margin?margin-loss:0;}if(equity>maint){uint256 gap=equity-maint;if(due<gap&&!(negative&&gap-due==1))revert NotLiquidatable();}}
  else if(int256(margin)+fullPnl>int256(maint))revert NotLiquidatable();
  p.reduce=reduction(size,e.liquidationReductionBps(market),e.liquidationMinRemainingSizeUsd(market));p.full=p.reduce==size||margin==0;p.pnl=_pnl(p.reduce,entry,isLong,price);
  if(!p.full&&p.pnl<0&&uint256(-p.pnl)>=margin)p.full=true;
  if(p.full){p.reduce=size;p.pnl=fullPnl;}else{p.remainingSize=size-p.reduce;p.remainingMargin=margin-(p.pnl<0?uint256(-p.pnl):0);}
 }
 function recoveryPlan(address engine,address account,uint256 market,uint256 price)external view returns(uint256 fromAvailable,uint256 fromMargin,uint256 due){
  ILiqEngine e=ILiqEngine(engine);(,,address token,,,uint32 maintenance,)=ILiqRegistry(e.registry()).markets(market);due=ILiqLedger(e.fundingLedger()).payableAmount(keccak256(abi.encode(account,market,token)));if(due==0)return(0,0,0);
  ILiqVault v=ILiqVault(e.vault());uint256 required=e.fundingWithdrawalRequirement(account,token);if(required<due)revert InvalidAmount();uint256 other=v.otherReservedCollateral(account,token)+required-due;uint256 available=v.availableBalance(account,token);if(other>available)return(0,0,due);
  (uint256 margin,uint256 size,uint256 entry,bool isLong,bool open)=e.positions(account,market);uint256 reserve;if(open){int256 pendingPnl=_pnl(size,entry,isLong,price);uint256 loss;if(pendingPnl<0){if(pendingPnl==type(int256).min)revert InvalidAmount();loss=uint256(-pendingPnl);}uint256 maint=size*uint256(maintenance)/10000;reserve=loss>=margin||maint>=margin-loss?margin:loss+maint;}
  (fromAvailable,fromMargin,)=fundingEligibility(available,other,0,margin,0,reserve,due);
 }
}
