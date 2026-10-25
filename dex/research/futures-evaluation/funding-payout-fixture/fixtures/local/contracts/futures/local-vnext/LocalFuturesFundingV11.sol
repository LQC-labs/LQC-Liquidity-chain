// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ILocalFundingCore,ICollectionExecution,IRepeatPayoutExecutor,IFundingToken} from "./LocalFuturesFunding.sol";
import {ILocalDomainRegistry} from "./LocalFuturesCore.sol";
import {LocalFuturesExposureLedger} from "./LocalFuturesExposureLedger.sol";

/// @notice Fresh LOCAL 31337 repeat-trading custody only. No legacy studies or migration.
contract LocalFuturesFundingV11 {
 ILocalFundingCore public immutable core;
 LocalFuturesExposureLedger public immutable exposureLedger;
 struct Domain {address token;address governor;uint8 decimals_;}
 enum InputMode {Unset,ResearchInput,CoreInput}
 uint256 private entered;
 mapping(uint256=>uint256) public boundSeries;
 error Forbidden();error Invalid();error WrongState();error PolicyBlocked();error Insufficient();error TransferFailed();error Reentrant();error Duplicate();
 modifier lock(){if(entered!=0)revert Reentrant();entered=1;_;entered=0;}
 constructor(address core_){
  if(block.chainid!=31337||core_==address(0)||core_.code.length==0)revert PolicyBlocked();
  core=ILocalFundingCore(core_);LocalFuturesExposureLedger ledger=new LocalFuturesExposureLedger(core_,address(this));
  if(address(ledger.core())!=core_||ledger.funding()!=address(this))revert Forbidden();exposureLedger=ledger;
 }
 function productionEnabled() external pure returns(bool){return false;}
 function _domain(uint256 id) private view returns(Domain memory d){(d.token,d.governor,d.decimals_)=core.fundingStudyDomain(id);}
 function _gov(Domain memory d) private view {if(msg.sender!=d.governor)revert Forbidden();}
 function _partialCaller() private view {if(msg.sender!=core.localPartial()||msg.sender==address(0))revert Forbidden();}
 function _registryGuard(uint256 id) private view {address r=core.domainRegistry();if(r!=address(0)){ILocalDomainRegistry registry=ILocalDomainRegistry(r);if(id<=registry.cutoff())registry.assertLegacyDomain(id);else registry.assertOperation(id,msg.sig);}}
 function registryGuardVersion() external pure returns(uint256){return 1;}
 function createFundingSeries(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes32) external pure {revert PolicyBlocked();}
 function setSeriesOI(uint256,uint256,uint256,uint256) external pure {revert PolicyBlocked();}
 function createCoreFundingSeries(uint256 id,uint256 sid,uint256 start,uint256 length,uint256 epochs,uint256 batch,uint256 capacity,uint256 rate,bytes32 policy) external lock {
 _registryGuard(id);
if(msg.sender!=address(core))revert Forbidden();if(epochs!=1||boundSeries[id]!=0)revert PolicyBlocked();boundSeries[id]=sid;_domain(id);exposureLedger.createCoreFundingSeries(id,sid,start,length,epochs,batch,capacity,rate,policy,msg.sender);}
 function advanceFundingSeries(uint256 id,uint256 sid,uint256 limit) external lock {
 _registryGuard(id);
exposureLedger.advanceFundingSeries(id,sid,limit);}
 function checkpointFundingAccount(uint256 id,uint256 sid,address who,uint256 limit) external lock {
 _registryGuard(id);
exposureLedger.checkpointFundingAccount(id,sid,who,limit);}
 function fixSeriesMemberUSD(uint256 id,uint256 sid,uint256 epoch,address who) external lock {
 _registryGuard(id);
exposureLedger.fixSeriesMemberUSD(id,sid,epoch,who);}
 function finalizeSeriesUSD(uint256 id,uint256 sid,uint256 epoch) external lock {
 _registryGuard(id);
exposureLedger.finalizeSeriesUSD(id,sid,epoch);}
 function convertSeriesEpoch(uint256,uint256,uint256) external pure {revert PolicyBlocked();}
 function fundingSeries(uint256 id,uint256 sid) external view returns(uint256[11] memory v,bytes32 policy){return exposureLedger.fundingSeries(id,sid);}
 function fundingSeriesEpoch(uint256 id,uint256 sid,uint256 epoch) external view returns(uint256[11] memory v,int256 usdN,uint256 usdD){if(msg.sender==payoutSpecification&&repeatPayoutEpochs[id].started)revert PolicyBlocked();return exposureLedger.fundingSeriesEpoch(id,sid,epoch);}
 function fundingSeriesAccount(uint256 id,uint256 sid,address who) external view returns(uint256[4] memory){return exposureLedger.fundingSeriesAccount(id,sid,who);}
 function fundingSeriesMember(uint256 id,uint256 sid,uint256 epoch,address who) external view returns(uint256[8] memory){return exposureLedger.fundingSeriesMember(id,sid,epoch,who);}
 function seriesInputMode(uint256 id,uint256 sid) external view returns(InputMode){return InputMode(uint8(exposureLedger.seriesInputMode(id,sid)));}
 function coreExposureSequences(bytes32 key) external view returns(uint256){return exposureLedger.coreExposureSequences(key);}
 function recordCoreExposure(uint256 id,uint256 sid,address account,uint256 positionId,uint256 sequence,bytes32 policy,uint256 expectedLong,uint256 expectedShort,uint256 nextLong,uint256 nextShort) external lock returns(bytes32 receipt){
 _registryGuard(id);
if(msg.sender!=address(core))revert Forbidden();return exposureLedger.recordCoreExposure(id,sid,account,positionId,sequence,policy,expectedLong,expectedShort,nextLong,nextShort,msg.sender);}
 function enablePolicyGapStudy(uint256 id,uint256 sid) external lock {
 _registryGuard(id);
_gov(_domain(id));exposureLedger.enablePolicyGapStudy(id,sid,msg.sender);}
 function policyGap(uint256 id,uint256 sid,address account,uint256 positionId) external view returns(uint256[12] memory v,bool closed,bool unresolved){return exposureLedger.policyGap(id,sid,account,positionId);}
 address public collectionCoordinator;
 address public collectionExecutor;
 mapping(bytes32=>uint256) public repeatAccountCollected;
 mapping(bytes32=>uint256) public repeatCash;
 mapping(address=>uint256) public repeatCustody;
 function bindCollectionCoordinator(address module,address executor_) external lock {
 if(core.domainRegistry()!=address(0))revert PolicyBlocked();

  if(msg.sender!=core.governance()||collectionCoordinator!=address(0)||module.code.length==0||executor_.code.length==0)revert Forbidden();
  // Executor constructor checks all reverse bindings; this hash fixes the same four addresses.
  if(ICollectionExecution(executor_).contextHash()!=keccak256(abi.encode(address(core),address(this),core.localPartial(),module)))revert Forbidden();
  collectionCoordinator=module;collectionExecutor=executor_;
 }
 function collectRepeat(uint256 id,bytes32 accountKey,bytes32 epochKey,uint256 amount,uint256 accountLimit) external lock {
 _registryGuard(id);
 if(repeatPayoutEpochs[id].started)revert PolicyBlocked();

  _partialCaller();
  if(amount==0||ICollectionExecution(collectionExecutor).fundingAuthorization()!=keccak256(msg.data)||repeatAccountCollected[accountKey]+amount>accountLimit)revert Forbidden();
  Domain memory d=_domain(id);IFundingToken t=IFundingToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 source=t.balanceOf(msg.sender);
  if(before_<repeatCustody[d.token]||!t.transferFrom(msg.sender,address(this),amount)||t.balanceOf(address(this))-before_!=amount||source-t.balanceOf(msg.sender)!=amount)revert TransferFailed();
  repeatAccountCollected[accountKey]+=amount;repeatCash[epochKey]+=amount;repeatCustody[d.token]+=amount;
 }

 address public payoutExecutor;
 address public payoutSpecification;
 struct RepeatPayoutEpoch {uint256 paid;uint256 reserved;bool started;}
 struct RepeatPayoutAccount {uint256 paid;uint256 sequence;bytes32 preparation;uint256 limit;}
 mapping(uint256=>RepeatPayoutEpoch) private repeatPayoutEpochs;
 mapping(bytes32=>RepeatPayoutAccount) private repeatPayoutAccounts;
 mapping(bytes32=>bytes32) private repeatPayoutReceipts;
 function repeatPayoutState(uint256 id,bytes32 rightsKey,bytes32 receipt) external view returns(RepeatPayoutEpoch memory epoch,RepeatPayoutAccount memory account,bytes32 commitment){
  return(repeatPayoutEpochs[id],repeatPayoutAccounts[rightsKey],repeatPayoutReceipts[receipt]);
 }
 function bindPayoutExecutor(address module) external lock {
  if(core.domainRegistry()!=address(0)||msg.sender!=core.governance()||payoutExecutor!=address(0)||module.code.length==0)revert Forbidden();
  address source=IRepeatPayoutExecutor(module).validateBinding(address(core),core.localPartial(),collectionCoordinator);
  if(source.code.length==0)revert Forbidden();payoutExecutor=module;payoutSpecification=source;
 }
 function payRepeat(uint256 id,address who,bytes32 preparation,uint256 sequence,uint256 amount) external lock returns(bytes32 receipt,uint256 cumulative){
  _registryGuard(id);
  _partialCaller();if(payoutExecutor==address(0)||amount==0)revert Forbidden();
  (bytes32 rightsKey,bytes32 epochKey,uint256 limit)=IRepeatPayoutExecutor(payoutExecutor).authorizePayout(id,who,preparation);
  RepeatPayoutEpoch storage e=repeatPayoutEpochs[id];RepeatPayoutAccount storage a=repeatPayoutAccounts[rightsKey];
  if(a.preparation==bytes32(0)){a.preparation=preparation;a.limit=limit;}
  if(sequence!=a.sequence+1||a.preparation!=preparation||a.limit!=limit||a.paid+amount>a.limit||e.paid+e.reserved+amount>repeatCash[epochKey])revert Insufficient();
  Domain memory d=_domain(id);IFundingToken t=IFundingToken(d.token);uint256 before_=t.balanceOf(address(this));uint256 destination=t.balanceOf(msg.sender);
  if(before_<repeatCustody[d.token]||repeatCustody[d.token]<amount)revert Insufficient();
  e.started=true;e.reserved+=amount;a.paid+=amount;a.sequence=sequence;e.paid+=amount;repeatCustody[d.token]-=amount;
  receipt=keccak256(abi.encode(rightsKey,sequence));cumulative=a.paid;
  if(repeatPayoutReceipts[receipt]!=bytes32(0))revert Forbidden();repeatPayoutReceipts[receipt]=keccak256(abi.encode(msg.data,cumulative));
  e.reserved-=amount;
  if(!t.transfer(msg.sender,amount)||before_-t.balanceOf(address(this))!=amount||t.balanceOf(msg.sender)-destination!=amount)revert TransferFailed();
  emit RepeatFundingPaid(receipt,id,who,sequence,amount,cumulative);
 }
 event RepeatFundingPaid(bytes32 indexed receipt,uint256 indexed domain,address indexed account,uint256 sequence,uint256 amount,uint256 cumulative);


}
