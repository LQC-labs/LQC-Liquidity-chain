// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LocalFuturesCore} from "./LocalFuturesCore.sol";
import {LocalFuturesFunding,IRepeatCollectionQuote} from "./LocalFuturesFunding.sol";
import {LocalFuturesPartialSettlement} from "./LocalFuturesPartialSettlement.sol";
/// @notice LOCAL 31337 orchestration only. No token custody, approvals or payouts.
contract LocalFuturesCollectionExecutor {
 LocalFuturesCore public immutable core;
 LocalFuturesFunding public immutable funding;
 LocalFuturesPartialSettlement public immutable partialSettlement;
 IRepeatCollectionQuote public immutable coordinator;
 bytes32 public immutable contextHash;
 uint256 private entered;
 bytes32 public partialAuthorization;
 bytes32 public fundingAuthorization;
 struct Execution {uint256 sequence;uint256 budget;uint256 pnl;uint256 funding;uint256 fee;bytes32 specification;}
 mapping(bytes32=>Execution) public executions;
 mapping(bytes32=>bool) public consumedSpecifications;
 error Forbidden();error Invalid();error Mismatch();
 modifier lock(){if(entered!=0)revert Forbidden();entered=1;_;entered=0;}
 constructor(address coordinator_){
  if(block.chainid!=31337||coordinator_.code.length==0)revert Forbidden();
  coordinator=IRepeatCollectionQuote(coordinator_);core=LocalFuturesCore(payable(coordinator.core()));funding=LocalFuturesFunding(coordinator.funding());partialSettlement=LocalFuturesPartialSettlement(coordinator.partialSettlement());
  if(core.localFunding()!=address(funding)||core.localPartial()!=address(partialSettlement)||address(funding.core())!=address(core)||address(partialSettlement.core())!=address(core)||partialSettlement.funding()!=address(funding))revert Mismatch();
  contextHash=keccak256(abi.encode(address(core),address(funding),address(partialSettlement),coordinator_));
 }
 function productionEnabled() external pure returns(bool){return false;}
 function execute(uint256 pid,bytes32 specification,uint256 sequence) external lock {
  if(funding.collectionExecutor()!=address(this))revert Forbidden();
  IRepeatCollectionQuote.Quote memory q=coordinator.collectionQuote(pid,specification);Execution storage e=executions[q.positionKey];
  if(msg.sender!=q.owner||consumedSpecifications[specification])revert Forbidden();
  if(sequence!=e.sequence+1||q.budget<=e.budget||q.pnl<e.pnl||q.funding<e.funding||q.fee<e.fee||(q.pnl==e.pnl&&q.funding==e.funding&&q.fee==e.fee)||q.funding>q.positionLimit||q.pnl+q.funding+q.fee>q.budget)revert Invalid();
  LocalFuturesPartialSettlement.LinkedBasis memory b=partialSettlement.linkedBasis(pid);
  (address owner,uint256[5] memory v,)=core.coreExposureContext(pid);
  if(owner!=q.owner||v[0]!=q.domain||v[3]+v[4]!=0||b.closed!=b.initialSize||q.budget>b.held)revert Mismatch();
  uint256 amount=q.funding-e.funding;uint256 pnl=q.pnl-e.pnl;uint256 fee=q.fee-e.fee;uint256 before_=funding.repeatAccountCollected(q.accountKey);
  if(before_+amount>q.accountLimit)revert Invalid();
  if(partialSettlement.linkedConsumed(pid)!=e.pnl+e.funding+e.fee)revert Mismatch();
  if(amount!=0)fundingAuthorization=keccak256(abi.encodeCall(LocalFuturesFunding.collectRepeat,(q.domain,q.accountKey,q.epochKey,amount,q.accountLimit)));
  partialAuthorization=keccak256(abi.encodeCall(LocalFuturesPartialSettlement.applyCollection,(pid,q.domain,pnl,amount,fee,q.accountKey,q.epochKey,q.accountLimit)));
  partialSettlement.applyCollection(pid,q.domain,pnl,amount,fee,q.accountKey,q.epochKey,q.accountLimit);
  if(partialSettlement.linkedConsumed(pid)!=q.pnl+q.funding+q.fee||funding.repeatAccountCollected(q.accountKey)-before_!=amount||keccak256(abi.encode(coordinator.collectionQuote(pid,specification)))!=keccak256(abi.encode(q)))revert Mismatch();
  partialAuthorization=bytes32(0);fundingAuthorization=bytes32(0);
  e.sequence=sequence;e.budget=q.budget;e.pnl=q.pnl;e.funding=q.funding;e.fee=q.fee;e.specification=specification;consumedSpecifications[specification]=true;
  emit Collected(q.positionKey,specification,sequence,amount);
 }
 event Collected(bytes32 indexed key,bytes32 indexed specification,uint256 sequence,uint256 amount);
}
