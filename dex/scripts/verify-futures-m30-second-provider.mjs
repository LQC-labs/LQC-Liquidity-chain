// M30, independent JSON-RPC audit of M29, read-only; no key/signature/transactions.
import { ethers } from "ethers";
import { writeFileSync } from "node:fs";
const START=131945040,END=144115366;
const FREEZE="0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e",TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const USER="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const EXPECTED=[
 ["0x263e7d9135a646caa958e3a317867a13f056e0c712ddd9429d9b432a2d45cda0",7,"OwnershipTransferred",VAULT],
 ["0x7ed4a0789aa89b091919e82b32c52b04d5ac3d1c17754c5db115877b1262cff5",13,"EngineChanged",VAULT],
 ["0x7a1e7681d44716fb1d662fe9a733adf3285bda5432bcbd64582b74ed5993b3c7",19,"CollateralSupportChanged",VAULT],
 ["0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1",7,"Deposit",VAULT],
 ["0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4",11,"CollateralLocked",VAULT],
 ["0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19",13,"CollateralUnlocked",VAULT],
 ["0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1",6,"Transfer",TOKEN]
];
const IFACE=new ethers.Interface([
 "event Transfer(address indexed from,address indexed to,uint256 value)",
 "event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)",
 "event EngineChanged(address indexed previousEngine,address indexed newEngine)",
 "event CollateralSupportChanged(address indexed token,bool supported)",
 "event Deposit(address indexed account,address indexed token,uint256 amount)",
 "event CollateralLocked(address indexed account,address indexed token,uint256 amount)",
 "event CollateralUnlocked(address indexed account,address indexed token,uint256 amount)",
 "function totalAccounted(address) view returns(uint256)",
 "function balanceOf(address) view returns(uint256)",
 "function availableBalance(address,address) view returns(uint256)",
 "function lockedBalance(address,address) view returns(uint256)"
]);
const SOURCES=[
 {operator:"BNB Chain official",url:"https://bsc-testnet-dataseed.bnbchain.org"},
 {operator:"dRPC",url:"https://bsc-testnet.drpc.org"}
];
const hex=x=>"0x"+x.toString(16),lc=x=>String(x||"").toLowerCase();
const key=(tx,index)=>lc(tx)+":"+Number(index);
async function rpc(url,method,params,ms=9500){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),ms);
 try{
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:11,method,params}),signal:ac.signal});
  if(!response.ok)throw Error("HTTP "+response.status);
  const json=await response.json();
  if(json.error)throw Error(String(json.error.message||json.error.code).slice(0,140));
  if(json.result===undefined)throw Error("missing JSON-RPC result");
  return json.result;
 }finally{clearTimeout(timer);}
}
const out={schema:"lqc-m30-independent-historical-rpc-v1",
 chainId:97,fromBlock:START,toBlockInclusive:END,freezeHash:FREEZE,
 status:"BLOCKED",providers:[],verifiedReceiptCount:0,
 completeSecondProviderCoverage:false,missingExpected:[],extraObserved:[],
 knownUserRightsPreserved:false,independentIndexerCompleteness:false,
 fullHistoricalInventoryComplete:false,provenDistributableSurplus:"0",
 payoutAuthorized:false,oldVaultModified:false,signingPerformed:false,transactionOccurred:false};
const expectedSet=new Set(EXPECTED.map(([tx,index])=>key(tx,index)));
for(const source of SOURCES){
 const rec={operator:source.operator,endpoint:source.url,chain:false,pinned:false,
   receiptEventsMatched:0,frozenBalancesMatched:false,logRanges:[],errors:[]};
 out.providers.push(rec);
 try{
  rec.chain=BigInt(await rpc(source.url,"eth_chainId",[]))===97n;
  if(!rec.chain)throw Error("chainId mismatch");
  const block=await rpc(source.url,"eth_getBlockByNumber",[hex(END),false]);
  rec.pinned=lc(block?.hash)===FREEZE;
  if(!rec.pinned)throw Error("pinned M08 historical block mismatch/unavailable");
  const txs=[...new Set(EXPECTED.map(x=>x[0]))],receipts=new Map();
  for(const tx of txs){
   const receipt=await rpc(source.url,"eth_getTransactionReceipt",[tx]);
   if(!receipt||BigInt(receipt.status)!==1n)throw Error("known tx receipt failed/unavailable");
   receipts.set(tx,receipt);
  }
  for(const [tx,index,event,address] of EXPECTED){
   const receipt=receipts.get(tx);
   const log=receipt.logs.find(x=>Number(BigInt(x.logIndex))===index);
   if(!log||lc(log.address)!==address)throw Error("receipt log missing "+key(tx,index));
   const p=IFACE.parseLog({topics:log.topics,data:log.data});
   if(p?.name!==event)throw Error("receipt event mismatch "+event);
   if(event==="Transfer"&&(lc(p.args.from)!==USER||lc(p.args.to)!==VAULT||
      p.args.value!==5000n*10n**18n))throw Error("known user Transfer wrong");
   if(event==="Deposit"&&(lc(p.args.account)!==USER||lc(p.args.token)!==TOKEN||
      p.args.amount!==5000n*10n**18n))throw Error("known user Deposit wrong");
   rec.receiptEventsMatched++;
  }
  out.verifiedReceiptCount=Math.max(out.verifiedReceiptCount,rec.receiptEventsMatched);
  // Historical state is often pruned on public full nodes. A missing trie node
  // must not suppress separately available historical log/receipt evidence.
  try {
   const call=async(to,method,args)=>{
    const data=IFACE.encodeFunctionData(method,args);
    const result=await rpc(source.url,"eth_call",[{to,data},hex(END)]);
    return IFACE.decodeFunctionResult(method,result)[0];
   };
   const [a,b,c,d]=await Promise.all([
    call(VAULT,"totalAccounted",[TOKEN]),call(TOKEN,"balanceOf",[VAULT]),
    call(VAULT,"availableBalance",[USER,TOKEN]),call(VAULT,"lockedBalance",[USER,TOKEN])
   ]);
   rec.frozenBalancesMatched=a===b&&b===c&&c===5000n*10n**18n&&d===0n;
   if(!rec.frozenBalancesMatched) rec.errors.push("frozen account balance mismatch");
   else out.knownUserRightsPreserved=true;
  } catch(e){
   rec.errors.push("HISTORICAL_STATE_UNAVAILABLE: "+String(e?.message||e).slice(0,145));
  }
  // Confirm independent full history ONLY if all three eth_getLogs ranges succeed.
  const padded=ethers.zeroPadValue(VAULT,32),transfer=IFACE.getEvent("Transfer").topicHash;
  const filters=[
   {address:VAULT,fromBlock:hex(START),toBlock:hex(END)},
   {address:TOKEN,fromBlock:hex(START),toBlock:hex(END),topics:[transfer,padded]},
   {address:TOKEN,fromBlock:hex(START),toBlock:hex(END),topics:[transfer,null,padded]}
  ];
  let complete=true;const gathered=new Set();
  for(let i=0;i<filters.length;i++){
   const scope=["vault_events","vault_token_out","vault_token_in"][i];
   try{
    const logs=await rpc(source.url,"eth_getLogs",[filters[i]],11000);
    if(!Array.isArray(logs))throw Error("no logs array");
    for(const log of logs)gathered.add(key(log.transactionHash,BigInt(log.logIndex)));
    rec.logRanges.push({scope,from:START,to:END,complete:true,count:logs.length});
   }catch(e){
    complete=false;
    rec.logRanges.push({scope,from:START,to:END,complete:false,error:String(e?.message||e).slice(0,145)});
   }
  }
  if(complete){
   const missing=[...expectedSet].filter(x=>!gathered.has(x));
   const extra=[...gathered].filter(x=>!expectedSet.has(x));
   rec.rangeMatchesM29=missing.length===0&&extra.length===0;
   out.missingExpected=missing;out.extraObserved=extra;
   if(rec.rangeMatchesM29){
    out.completeSecondProviderCoverage=true;
    out.chosenOperator=source.operator;
    break;
   }
   rec.errors.push("independent eth_getLogs result differs from M29 event identities");
  }else {
   // Explicitly partial probes; never use them to claim full-range completeness.
   const anchors=[START,131970723,131978250,131980821,131984084,END];
   for(const blockNumber of anchors){
    try{
     const from=Math.max(START,blockNumber-1),to=Math.min(END,blockNumber+1);
     const logs=await rpc(source.url,"eth_getLogs",[{address:VAULT,
      fromBlock:hex(from),toBlock:hex(to)}],6500);
     rec.logRanges.push({scope:"bounded_vault_probe",from,to,complete:true,count:logs.length});
    }catch(e){
     rec.logRanges.push({scope:"bounded_vault_probe",blockNumber,
      complete:false,error:String(e?.message||e).slice(0,130)});
    }
   }
  }
 }catch(e){rec.errors.push(String(e?.message||e).slice(0,220));}
}
out.status=out.completeSecondProviderCoverage ?
 "INDEPENDENT_FULL_RANGE_EVENT_SET_MATCH__ECONOMIC_RIGHTS_BLOCKED":
 out.verifiedReceiptCount===EXPECTED.length?"INDEPENDENT_KNOWN_RECEIPTS_PASS__FULL_RANGE_BLOCKED":
 "SECOND_PROVIDER_HISTORICAL_EVIDENCE_BLOCKED";
out.reason=out.completeSecondProviderCoverage?
 "Matching range-limited event sets for selected historical token and Vault are not universal multi-asset/claim ownership proof.":
 "At least one independent full-range log response is missing or mismatched; sampled receipts cannot prove the entire historical interval.";
writeFileSync("futures-m30-second-rpc.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out,null,2));
