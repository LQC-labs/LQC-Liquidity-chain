// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {SettlementMath as M} from "./SettlementMath.sol";

/// @notice Stateless LOCAL 31337 arithmetic. No custody, approvals, claims or mutable ledger.
contract LocalFuturesFundingStudyCalculation {
 error PolicyBlocked();
 constructor(){if(block.chainid!=31337)revert PolicyBlocked();}
 function productionEnabled() external pure returns(bool){return false;}

 // now,end,last,longOI,shortOI,le,se,matched; timestamps come from Funding.
 function checkpointEpoch(uint256[8] calldata v) external pure returns(uint256 t,uint256 le,uint256 se,uint256 matched){
  t=v[0]<v[1]?v[0]:v[1];uint256 dt=t-v[2];
  le=v[5]+v[3]*dt;se=v[6]+v[4]*dt;
  matched=v[7]+(v[3]<v[4]?v[3]:v[4])*dt;
 }
 function checkpointMember(uint256 t,uint256 last,uint256 l,uint256 s,uint256 le,uint256 se) external pure returns(uint256,uint256){
  return(le+l*(t-last),se+s*(t-last));
 }
 function sealTotal(uint256 start,uint256 end,uint256 le,uint256 se,uint256 matched,uint256 rate) external pure returns(bool longPays,M.Fraction memory total){
  longPays=le>=se;uint256 sum=le+se;
  total=sum==0?M.fraction(0,1):M.fraction(M.signed(matched*(le>=se?le-se:se-le)*rate,false),(end-start)*sum*10000);
 }
 function convertTotal(M.Fraction calldata total,uint8 decimals_,uint256 price) external pure returns(M.Fraction memory){
  return M.scaleFraction(total,10**decimals_,price);
 }
 // debt,claim,debtRem,claimRem,debtDen,claimDen; preserve reduced fractions exactly.
 function memberRights(M.Fraction calldata total,bool longPays,uint256 le,uint256 se,uint256 memberLE,uint256 memberSE) external pure returns(uint256[6] memory v){
  uint256 payer=longPays?le:se;uint256 receiver=longPays?se:le;
  M.Fraction memory debt=payer==0?M.fraction(0,1):M.scaleFraction(total,longPays?memberLE:memberSE,payer);
  M.Fraction memory claim_=receiver==0?M.fraction(0,1):M.scaleFraction(total,longPays?memberSE:memberLE,receiver);
  v=[uint256(debt.n)/debt.d,uint256(claim_.n)/claim_.d,uint256(debt.n)%debt.d,uint256(claim_.n)%claim_.d,debt.d,claim_.d];
 }
 // Only arithmetic: Funding applies all credit, escrow, cash and obligation changes.
 function allocateCollection(uint256 credit,uint256 used,uint256 pnlDue,uint256 debt,uint256 feeDue) external pure returns(uint256 take,uint256 p,uint256 f,uint256 reserve,uint256 fee){
  uint256 total=pnlDue+debt;take=credit<total-used?credit:total-used;
  uint256 nextUsed=used+take;(p,f,reserve)=M.proportionalFunding(nextUsed,pnlDue,debt);
  if(nextUsed==total){uint256 remaining=credit-take;fee=remaining<feeDue?remaining:feeDue;}
 }
}
