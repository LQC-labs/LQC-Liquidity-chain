// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library StoredHistory {
 struct Basis {bytes32 key;uint256 initialSize;uint256 margin;uint256 closed;uint256 held;uint256 sequence;uint256 partials;uint256 entry;}
 struct Exit {uint256 status;uint256 timestamp;uint256 heldDelta;uint256 closed;uint256 market;uint256 collateral;uint256 marketTime;uint256 collateralTime;uint256 cutoff;uint256 epoch;bytes32 receipt;}
 struct Trace {bytes32 key;address owner;uint256 domain;uint256 sid;uint256 opened;uint256 last;uint256 size;uint256 sequence;bool long_;}
 struct Config {uint256 sid;bytes32 policy;uint256 origin;uint256 length;uint256 epochs;uint256 historyCap;uint256 batch;}
 struct Log {uint256 count;uint256 reserved;uint256 livePid;uint256 last;}
 struct Transition {uint256 timestamp;uint256 pid;uint256 sequence;uint256 oldL;uint256 oldS;uint256 nextL;uint256 nextS;bytes32 receipt;}
}
interface IHCore {
 function localFunding() external view returns(address);
 function localPartial() external view returns(address);
 function coreExposureContext(uint256) external view returns(address,uint256[5] memory,bytes32);
 function exposureBindings(uint256) external view returns(uint256,bytes32,uint256,uint256);
}
interface IHFunding {
 function core() external view returns(address);
 function coreExposureSequences(bytes32) external view returns(uint256);
 function fundingSeries(uint256,uint256) external view returns(uint256[11] memory,bytes32);
}
interface IHPartial {
 function core() external view returns(address);
 function funding() external view returns(address);
 function attribution() external view returns(address);
 function linkedBasis(uint256) external view returns(StoredHistory.Basis memory);
 function linkedExit(uint256,uint256,bool) external view returns(StoredHistory.Exit memory);
}
interface IHAttribution {
 function core() external view returns(address);
 function funding() external view returns(address);
 function partialSettlement() external view returns(address);
 function config(uint256) external view returns(StoredHistory.Config memory);
 function traces(uint256) external view returns(StoredHistory.Trace memory);
 function logs(bytes32) external view returns(StoredHistory.Log memory);
 function accountKey(uint256,address) external view returns(bytes32);
 function finalOrdinal(uint256) external view returns(uint256);
 function transition(uint256,address,uint256) external view returns(StoredHistory.Transition memory);
}
/// @notice LOCAL 31337, full stored-account-log scan only. No authentication of Oracle,
/// policy or Funding; no custody, consumption, registration, settlement or execution API.
contract StoredExitHistoryVerifier {
 address[4] public peers; // Core, Funding, Partial, Attribution
 bytes32[4] public expectedCodeHashes; // supplied from reviewed compiler artifacts, never adopted from peers
 uint256 public constant MAX_ACCOUNT_RECORDS=256;
 uint256 public constant PRICE_AUTHENTICATION_MISSING=1;
 uint256 public constant POLICY_AUTHENTICATION_MISSING=2;
 uint256 public constant FUNDING_AUTHENTICATION_MISSING=4;
 uint256 public constant INDEPENDENT_CHAIN_AUTHENTICATION_MISSING=8;
 enum AmountState {NOT_EVALUATED}
 struct Report {
  bool historyMatches; bool completelyClosed;
  uint256 openingCount; uint256 exitCount; uint256 accountRecordsScanned;
  uint256 cumulativeClosed; uint256 remaining; uint256 finalSequence;
  bytes32 commitment; AmountState amountState; uint256 blockers;
  bool priceAuthenticated; bool policyAuthenticated; bool fundingAuthenticated;
  bool chainIndependentlyAuthenticated;
  bool settlementAuthorized; bool createsClaim; bool consumesHistory;
  bool paymentAuthorized; bool returnAuthorized; bool heldUseAuthorized;
  bool lpRecoveryAuthorized; bool rightsTransferAuthorized;
 }
 error LocalOnly(); error CodeHash(uint256 peer); error LinkMismatch();
 error ScopeMismatch(); error SequenceMismatch(); error HistoryBound();
 error TransitionMismatch(uint256 ordinal); error ReceiptMismatch(uint256 sequence);
 error ExitMismatch(uint256 sequence); error TerminalMismatch(); error OpenPosition();
 error CommitmentMismatch();
 constructor(address[4] memory addresses_,bytes32[4] memory hashes_){
  if(block.chainid!=31337)revert LocalOnly();
  peers=addresses_;expectedCodeHashes=hashes_;_checkPeers();
 }
 function productionEnabled() external pure returns(bool){return false;}
 function _checkPeers() private view {
  if(block.chainid!=31337)revert LocalOnly();
  for(uint256 i;i<4;i++){
   if(peers[i].code.length==0||expectedCodeHashes[i]==bytes32(0)||peers[i].codehash!=expectedCodeHashes[i])revert CodeHash(i);
   for(uint256 j;j<i;j++)if(peers[i]==peers[j])revert LinkMismatch();
  }
  if(IHCore(peers[0]).localFunding()!=peers[1]||IHCore(peers[0]).localPartial()!=peers[2]
   ||IHFunding(peers[1]).core()!=peers[0]||IHPartial(peers[2]).core()!=peers[0]
   ||IHPartial(peers[2]).funding()!=peers[1]||IHPartial(peers[2]).attribution()!=peers[3]
   ||IHAttribution(peers[3]).core()!=peers[0]||IHAttribution(peers[3]).funding()!=peers[1]
   ||IHAttribution(peers[3]).partialSettlement()!=peers[2])revert LinkMismatch();
 }
 /// Expected values are comparison constraints, not source authentication.
 /// Scans the entire bounded account log, not a caller-selected page/list.
 function inspect(uint256 pid,bytes32 expectedKey,uint256 expectedFinalSequence,bytes32 expectedCommitment,bool requireClosed) external view returns(Report memory r){
  _checkPeers();IHAttribution attr=IHAttribution(peers[3]);
  StoredHistory.Trace memory t=attr.traces(pid);StoredHistory.Basis memory b=IHPartial(peers[2]).linkedBasis(pid);
  (address owner,uint256[5] memory v,bytes32 policy)=IHCore(peers[0]).coreExposureContext(pid);
  bytes32 key=keccak256(abi.encode(peers[0],peers[1],t.domain,t.sid,t.owner,pid,policy));
  if(pid==0||owner==address(0)||owner!=t.owner||v[0]!=t.domain||v[1]!=t.sid||b.key!=key||t.key!=key||expectedKey!=key||policy==bytes32(0))revert ScopeMismatch();
  if(t.sequence==0||v[2]!=t.sequence||b.sequence!=t.sequence||expectedFinalSequence!=t.sequence||IHFunding(peers[1]).coreExposureSequences(key)!=t.sequence)revert SequenceMismatch();
  StoredHistory.Config memory cfg=attr.config(t.domain);
  (uint256 sid,bytes32 fp,,)=IHCore(peers[0]).exposureBindings(t.domain);
  (uint256[11] memory f,bytes32 fundingPolicy)=IHFunding(peers[1]).fundingSeries(t.domain,t.sid);
  if(cfg.sid!=t.sid||sid!=t.sid||cfg.policy!=policy||fp!=policy||fundingPolicy!=policy||cfg.length==0||cfg.epochs==0||f[0]!=cfg.origin||f[1]!=cfg.length||f[2]!=cfg.epochs)revert ScopeMismatch();
  bytes32 account=attr.accountKey(t.domain,owner);
  bytes32 expectedAccount=keccak256(abi.encode(peers[3],peers[2],peers[0],peers[1],t.domain,t.sid,policy,owner));
  if(account!=expectedAccount)revert ScopeMismatch();
  StoredHistory.Log memory log=attr.logs(account);
  if(cfg.historyCap<2||cfg.historyCap>MAX_ACCOUNT_RECORDS||log.count==0||log.count+log.reserved>cfg.historyCap)revert HistoryBound();
  bool closed=t.size==0;
  if(requireClosed&&!closed)revert OpenPosition();
  if(b.initialSize==0||b.closed>b.initialSize||b.initialSize-b.closed!=t.size||v[3]+v[4]!=t.size||(t.long_?v[4]!=0:v[3]!=0))revert TerminalMismatch();
  bytes32 digest=keccak256(abi.encode("LOCAL_STORED_EXIT_HISTORY_V1",block.chainid,peers,expectedCodeHashes,pid,key,owner,t.domain,t.sid,policy,cfg));
  uint256 seen;uint256 previous;uint256 lastTime;uint256 accountTime;uint256 lastOrdinal;uint256 held;
  for(uint256 ordinal=1;ordinal<=log.count;ordinal++){
   StoredHistory.Transition memory row=attr.transition(t.domain,owner,ordinal);
   if(row.timestamp<accountTime||row.timestamp>block.timestamp||row.pid==0)revert TransitionMismatch(ordinal);
   accountTime=row.timestamp;
   if(row.pid!=pid)continue;
   seen++;
   if(row.sequence!=seen)revert SequenceMismatch();
   uint256 old=row.oldL+row.oldS;uint256 next=row.nextL+row.nextS;
   if(row.timestamp<cfg.origin||row.timestamp<lastTime||(t.long_?(row.oldS!=0||row.nextS!=0):(row.oldL!=0||row.nextL!=0)))revert TransitionMismatch(ordinal);
   if(seen==1){
    if(old!=0||next!=b.initialSize||row.timestamp!=t.opened||row.timestamp>=cfg.origin+cfg.length*cfg.epochs)revert TransitionMismatch(ordinal);
   }else{
    if(ordinal!=lastOrdinal+1||old!=previous||next>=old||old==0)revert TransitionMismatch(ordinal);
   }
   bytes32 receipt=keccak256(abi.encode(key,seen,row.timestamp,row.oldL,row.oldS,row.nextL,row.nextS));
   if(row.receipt!=receipt)revert ReceiptMismatch(seen);
   digest=keccak256(abi.encode(digest,ordinal,row));
   if(seen>1){
    bool final_=closed&&seen==t.sequence;
    StoredHistory.Exit memory e=IHPartial(peers[2]).linkedExit(pid,seen,final_);
    uint256 cutoff=cfg.origin+cfg.length*cfg.epochs;
    uint256 epoch=row.timestamp>=cutoff?cfg.epochs+1:(row.timestamp-cfg.origin)/cfg.length+1;
    if(e.status!=(final_?2:3)||e.closed!=b.initialSize-next||e.timestamp!=row.timestamp||e.receipt!=receipt||e.cutoff!=cutoff||e.epoch!=epoch||e.market==0||e.collateral==0||e.marketTime==0||e.collateralTime==0||e.marketTime>e.timestamp||e.collateralTime>e.timestamp)revert ExitMismatch(seen);
    held+=e.heldDelta;digest=keccak256(abi.encode(digest,e));
   }
   previous=next;lastTime=row.timestamp;lastOrdinal=ordinal;
  }
  if(seen!=t.sequence||previous!=t.size||lastTime!=t.last||held!=b.held||b.partials!=(closed?seen-2:seen-1)||log.last!=accountTime)revert TerminalMismatch();
  if(closed){if(seen<2||attr.finalOrdinal(pid)!=lastOrdinal||b.closed!=b.initialSize||b.held!=b.margin)revert TerminalMismatch();}
  else if(attr.finalOrdinal(pid)!=type(uint256).max||log.livePid!=pid)revert TerminalMismatch();
  digest=keccak256(abi.encode(digest,t,b,lastOrdinal));
  if(expectedCommitment!=bytes32(0)&&digest!=expectedCommitment)revert CommitmentMismatch();
  r.historyMatches=true;r.completelyClosed=closed;r.openingCount=1;r.exitCount=seen-1;r.accountRecordsScanned=log.count;
  r.cumulativeClosed=b.closed;r.remaining=t.size;r.finalSequence=seen;r.commitment=digest;r.amountState=AmountState.NOT_EVALUATED;
  r.blockers=PRICE_AUTHENTICATION_MISSING|POLICY_AUTHENTICATION_MISSING|FUNDING_AUTHENTICATION_MISSING|INDEPENDENT_CHAIN_AUTHENTICATION_MISSING;
  // No financial amount field: integer zero cannot masquerade as an evaluated amount.
  // Authentication and all execution flags intentionally remain false.
 }
}
