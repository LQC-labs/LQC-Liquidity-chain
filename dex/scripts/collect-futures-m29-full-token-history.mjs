// M29 historical token Transfer and Vault account-log reconciliation. STRICTLY READ-ONLY.
// Uses the existing ENVIO_API_TOKEN secret for HyperSync; never logs credentials.
// RPC receipts independently corroborate returned event identities, not global indexer completeness.
import { ethers } from "ethers";
import { writeFileSync } from "node:fs";

const START=131945040, END=144115367, FREEZE=144115366;
const HASH="0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208";
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const KNOWN="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const BASE="https://bsc-testnet.hypersync.xyz";
const MAX_PAGES=12, MAX_SCANNED_LOGS=3000, MAX_RECEIPTS=100;
const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_READONLY_RPC||
  "https://bsc-testnet-rpc.publicnode.com",97,{staticNetwork:true});
const tokenIface=new ethers.Interface(["event Transfer(address indexed from,address indexed to,uint256 value)",
  "function balanceOf(address) view returns(uint256)"]);
const vaultIface=new ethers.Interface([
  "event Deposit(address indexed account,address indexed token,uint256 amount)",
  "event Withdrawal(address indexed account,address indexed token,uint256 amount)",
  "event CollateralLocked(address indexed account,address indexed token,uint256 amount)",
  "event CollateralUnlocked(address indexed account,address indexed token,uint256 amount)",
  "event PnLSettled(address indexed account,address indexed token,int256 pnl)",
  "event EngineChanged(address indexed previousEngine,address indexed newEngine)",
  "event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)",
  "function totalAccounted(address) view returns(uint256)",
  "function availableBalance(address,address) view returns(uint256)",
  "function lockedBalance(address,address) view returns(uint256)"
]);
const report={
 schema:"lqc-m29-token-vault-ledger-history-v1",chainId:97,fromBlock:START,toBlockExclusive:END,
 freezeBlock:FREEZE,freezeHash:HASH,vault:VAULT,token:TOKEN,knownAccount:KNOWN,
 status:"BLOCKED",indexerRangeComplete:false,independentGlobalCompleteness:false,
 fullHistoricalInventoryComplete:false,protocolOwnedSurplus:"0",payoutAuthorized:false,
 actualTransactionsSent:false,signingPerformed:false,pr460Modified:false,
 pageCoverage:[],tokenTransfers:[],vaultEvents:[],unknownVaultTopics:[],errors:[]
};
function errorMessage(e){return String(e?.shortMessage||e?.message||e)
 .replaceAll(process.env.ENVIO_API_TOKEN||"__UNSET__","[REDACTED]").slice(0,350);}
async function indexerQuery(from){
 const token=process.env.ENVIO_API_TOKEN;
 if(!token) throw Error("ENVIO_API_TOKEN missing");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),23000);
 try {
  const body={from_block:from,to_block:END,logs:[
    {address:[TOKEN],topics:[[tokenIface.getEvent("Transfer").topicHash]]},
    {address:[VAULT]}
   ],field_selection:{log:["address","block_number","transaction_hash","log_index",
     "topic0","topic1","topic2","topic3","data"]}};
  const response=await fetch(BASE+"/query",{method:"POST",signal:controller.signal,
   headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(body)});
  if(!response.ok)throw Error("HyperSync HTTP "+response.status);
  return await response.json();
 }finally{clearTimeout(timeout);}
}
const lower=(x)=>String(x||"").toLowerCase();
const key=(l)=>l.transactionHash+":"+l.logIndex;
async function readFrozen(to,iface,func,args){
 const raw=await provider.call({to,data:iface.encodeFunctionData(func,args)},FREEZE);
 return iface.decodeFunctionResult(func,raw)[0];
}
try {
 if(BigInt(await provider.send("eth_chainId",[]))!==97n)throw Error("RPC wrong chain");
 const pinned=await provider.getBlock(FREEZE);
 if(lower(pinned?.hash)!==HASH)throw Error("frozen block hash not available/incorrect");
 const ids=new Set(),receiptTransactions=new Set(),accounts=new Set();
 let cursor=START,scanned=0;
 for(let n=0;cursor<END&&n<MAX_PAGES;n++){
  const res=await indexerQuery(cursor);
  const next=res?.next_block;
  if(!Number.isSafeInteger(next)||next<=cursor||next>END)throw Error("non-advancing indexer cursor");
  if(res?.archive_height!==undefined&&Number(res.archive_height)<next)
   throw Error("indexer archive below cursor");
  const raw=res?.data;
  const logs=Array.isArray(raw?.logs)?raw.logs:Array.isArray(raw)?raw.flatMap(x=>x?.logs||[]):null;
  if(!Array.isArray(logs))throw Error("missing indexer log collection");
  scanned+=logs.length;
  if(scanned>MAX_SCANNED_LOGS)throw Error("log cap reached; report BLOCKED for completeness");
  for(const l of logs){
   const log={address:lower(l.address),blockNumber:Number(l.block_number),
     transactionHash:lower(l.transaction_hash),logIndex:Number(l.log_index),
     topics:[l.topic0,l.topic1,l.topic2,l.topic3].filter(x=>x!=null),data:l.data||"0x"};
   if(!ethers.isAddress(log.address)||!ethers.isHexString(log.transactionHash,32)||
      !Number.isSafeInteger(log.blockNumber)||log.blockNumber<cursor||
      log.blockNumber>=next||!Number.isSafeInteger(log.logIndex)||log.logIndex<0)
    throw Error("invalid indexed event identity/range");
   if(ids.has(key(log)))throw Error("duplicate log in indexer result");
   ids.add(key(log));
   if(log.address===TOKEN){
    const decoded=tokenIface.parseLog(log);
    if(decoded?.name!=="Transfer")throw Error("non-Transfer token log");
    const from=lower(decoded.args.from),to=lower(decoded.args.to);
    if(from===VAULT||to===VAULT){
     report.tokenTransfers.push({tx:log.transactionHash,logIndex:log.logIndex,
       blockNumber:log.blockNumber,from,to,amount:decoded.args.value.toString(),receiptVerified:false});
     receiptTransactions.add(log.transactionHash);
    }
   }else if(log.address===VAULT){
    try{
     const decoded=vaultIface.parseLog(log);
     if(!decoded)throw Error("cannot decode");
     const record={tx:log.transactionHash,logIndex:log.logIndex,blockNumber:log.blockNumber,
       name:decoded.name,receiptVerified:false};
     if(["Deposit","Withdrawal","CollateralLocked","CollateralUnlocked","PnLSettled"].includes(decoded.name)){
      record.account=lower(decoded.args.account);
      record.token=lower(decoded.args.token);
      record.amount=String(decoded.args.amount??decoded.args.pnl??"UNAVAILABLE");
      accounts.add(record.account);
     }
     report.vaultEvents.push(record);
    }catch{
     report.unknownVaultTopics.push({tx:log.transactionHash,logIndex:log.logIndex,
       blockNumber:log.blockNumber,topic0:lower(log.topics[0]||"")});
    }
    receiptTransactions.add(log.transactionHash);
   }else throw Error("unexpected indexed contract");
  }
  report.pageCoverage.push({from:cursor,toExclusive:next,returnedLogs:logs.length,complete:true});
  cursor=next;
 }
 report.scannedThroughExclusive=cursor;
 report.indexerRangeComplete=cursor===END;
 report.indexerReturnedLogs=scanned;
 if(!report.indexerRangeComplete)throw Error("pagination cap reached before frozen snapshot");
 if(receiptTransactions.size>MAX_RECEIPTS)throw Error("receipt verification cap reached");
 const receiptCache=new Map();
 for(const tx of [...receiptTransactions].sort()){
  const receipt=await provider.getTransactionReceipt(tx);
  if(!receipt||receipt.status!==1||receipt.blockNumber>FREEZE)throw Error("missing/failed receipt "+tx);
  receiptCache.set(tx,receipt);
 }
 for(const entry of [...report.tokenTransfers,...report.vaultEvents,...report.unknownVaultTopics]){
  const receipt=receiptCache.get(entry.tx);
  const log=receipt?.logs.find(x=>x.index===entry.logIndex);
  if(!log||lower(log.address)!==(report.tokenTransfers.includes(entry)?TOKEN:VAULT)||
     lower(log.transactionHash)!==entry.tx||log.blockNumber!==entry.blockNumber)
   throw Error("receipt index/address identity mismatch "+entry.tx);
  entry.receiptVerified=true;
 }
 const transfers=report.tokenTransfers;
 let incoming=0n,outgoing=0n;
 for(const t of transfers){
  if(t.to===VAULT)incoming+=BigInt(t.amount);
  if(t.from===VAULT)outgoing+=BigInt(t.amount);
 }
 report.incomingBaseUnits=incoming.toString();
 report.outgoingBaseUnits=outgoing.toString();
 report.netTransferBaseUnits=(incoming-outgoing).toString();
 const depositEvents=report.vaultEvents.filter(x=>x.name==="Deposit"||x.name==="Withdrawal");
 const matching=new Set();
 report.unattributedTransfers=[];
 for(const t of transfers){
  const deposit=t.to===VAULT&&t.from!==VAULT;
  const withdraw=t.from===VAULT&&t.to!==VAULT;
  const match=depositEvents.filter(e=>e.tx===t.tx&&e.name===(deposit?"Deposit":"Withdrawal")&&
    e.token===TOKEN&&e.account===(deposit?t.from:t.to)&&e.amount===t.amount);
  if((deposit||withdraw)&&match.length===1){matching.add(key(match[0]));}
  else report.unattributedTransfers.push({tx:t.tx,logIndex:t.logIndex,amount:t.amount});
 }
 report.unmatchedAccountingEvents=depositEvents.filter(x=>!matching.has(key(x)));
 const [total,actual,knownAvailable,knownLocked]=await Promise.all([
  readFrozen(VAULT,vaultIface,"totalAccounted",[TOKEN]),
  readFrozen(TOKEN,tokenIface,"balanceOf",[VAULT]),
  readFrozen(VAULT,vaultIface,"availableBalance",[KNOWN,TOKEN]),
  readFrozen(VAULT,vaultIface,"lockedBalance",[KNOWN,TOKEN])
 ]);
 report.frozen={totalAccounted:total.toString(),actualTokenBalance:actual.toString(),
  knownUserAvailable:knownAvailable.toString(),knownUserLocked:knownLocked.toString()};
 report.accountsFromVaultLogs=[...accounts].sort();
 report.accountRightsPreserved=knownAvailable===5000n*10n**18n&&knownLocked===0n;
 report.transferNetMatchesFrozen=incoming>=outgoing&&(incoming-outgoing)===actual;
 report.vaultPhysicalAccountedMatch=actual===total;
 report.knownM08DepositReceiptPresent=report.tokenTransfers.some(x=>
  x.tx==="0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1"&&
  x.from===KNOWN&&x.to===VAULT&&x.amount==="5000000000000000000000");
 report.status=report.accountRightsPreserved&&report.transferNetMatchesFrozen&&
  report.vaultPhysicalAccountedMatch&&report.knownM08DepositReceiptPresent&&
  report.unattributedTransfers.length===0&&report.unmatchedAccountingEvents.length===0&&
  report.unknownVaultTopics.length===0?"INDEXED_TRANSFERS_RECEIPTS_RECONCILED__GLOBAL_PROVENANCE_BLOCKED":
  "SOURCE_AND_ACCOUNTING_INCOMPLETE__BLOCKED";
 report.reason="One HyperSync indexer range plus matching RPC receipts do not independently prove "+
  "all token transfers/account claims or any economic entitlement; no token is eligible for payout.";
}catch(e){report.errors.push(errorMessage(e));report.status="BLOCKED";}
writeFileSync("futures-m29-historical-transfers.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:report.status,coverage:report.indexerRangeComplete,
 pages:report.pageCoverage.length,transfers:report.tokenTransfers.length,
 vaultEvents:report.vaultEvents.map(x=>({name:x.name,tx:x.tx,logIndex:x.logIndex,amount:x.amount})),
 unknownVaultTopics:report.unknownVaultTopics,
 unattributedTransfers:report.unattributedTransfers,
 unmatchedAccountingEvents:report.unmatchedAccountingEvents,
 accountCount:report.accountsFromVaultLogs?.length,
 incoming:report.incomingBaseUnits,outgoing:report.outgoingBaseUnits,
 transferNetMatchesFrozen:report.transferNetMatchesFrozen,accountRightsPreserved:report.accountRightsPreserved,
 errors:report.errors,fullHistoricalInventoryComplete:false,payoutAuthorized:false},null,2));
