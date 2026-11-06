// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// Stateless plan only. Engine retains authorization, Funding checkpoint and all execution.
interface IAdlEngine {function registry()external view returns(address);function vault()external view returns(address);function fundingLedger()external view returns(address);function fundingWithdrawalRequirement(address,address)external view returns(uint256);function positions(address,uint256)external view returns(uint256,uint256,uint256,bool,bool);function fundingMarketLength(address,address)external view returns(uint256);function fundingMarketAt(address,address,uint256)external view returns(uint256);function previewFundingDomain(address,uint256,address)external view returns(int256,int256);}
interface IAdlRegistry{function markets(uint256)external view returns(bytes32,address,address,address,uint32,uint32,bool);}
interface IAdlLedger{function payableAmount(bytes32)external view returns(uint256);function accountPayable(address,address)external view returns(uint256);}
interface IAdlVault{function availableBalance(address,address)external view returns(uint256);function otherReservedCollateral(address,address)external view returns(uint256);}
contract AdlCalculator {
 error InvalidReduction();error AdlPositionNotProfitable();
 function plan(uint256 margin,uint256 size,uint256 entry,bool isLong,uint256 reduce,uint256 debt,uint256 price)external pure returns(uint256 released,uint256 absorbed){if(size==0||reduce==0||reduce>size)revert InvalidReduction();int256 pnl=isLong?(int256(price)-int256(entry))*int256(reduce)/int256(entry):(int256(entry)-int256(price))*int256(reduce)/int256(entry);if(pnl<=0)revert AdlPositionNotProfitable();uint256 profit=uint256(pnl);absorbed=profit<debt?profit:debt;released=margin*reduce/size;if(released==0)revert InvalidReduction();}
 /// Mechanical collection quote, NOT permission to execute conditional ADL.
 function fundingCollectionQuote(uint256 available,uint256 otherReserved,uint256 pnlAvailableReserve,uint256 ownMargin,uint256 pnlReserve,uint256 maintenance,uint256 payable_)external pure returns(uint256 eligible,bool fullyCollectible){if(otherReserved>available||pnlAvailableReserve>available-otherReserved||pnlReserve>ownMargin||maintenance>ownMargin-pnlReserve)return(0,false);eligible=available-otherReserved-pnlAvailableReserve+ownMargin-pnlReserve-maintenance;fullyCollectible=payable_<=eligible;}
 error LedgerDebtOutstanding();
 /// Stateless quote: current-market integer debt only, other integer debts reject; every fractional hold survives.
 function conditionalCollection(address engine,address account,uint256 market,uint256 reduce,uint256 released)external view returns(uint256 due){
  IAdlEngine e=IAdlEngine(engine);(,,address token,,,uint32 maintenance,)=IAdlRegistry(e.registry()).markets(market);
  (uint256 margin,uint256 size,,,)=e.positions(account,market);
  if(reduce>size||released>margin)revert InvalidReduction();
  if(margin-released<(size-reduce)*uint256(maintenance)/10000)revert InvalidReduction();
  IAdlLedger l=IAdlLedger(e.fundingLedger());due=l.payableAmount(keccak256(abi.encode(account,market,token)));
  if(l.accountPayable(account,token)!=due)revert LedgerDebtOutstanding();
  uint256 required=e.fundingWithdrawalRequirement(account,token);if(required<due)revert LedgerDebtOutstanding();
  uint256 count=e.fundingMarketLength(account,token);if(count>16)revert LedgerDebtOutstanding();
  for(uint256 i;i<count;i++){(int256 pending,)=e.previewFundingDomain(account,e.fundingMarketAt(account,token,i),token);if(pending<0)revert LedgerDebtOutstanding();}
  IAdlVault v=IAdlVault(e.vault());uint256 reserved=v.otherReservedCollateral(account,token)+required-due;
  uint256 afterRelease=v.availableBalance(account,token)+released;
  if(reserved>afterRelease||due>afterRelease-reserved)revert LedgerDebtOutstanding();
 }
}
