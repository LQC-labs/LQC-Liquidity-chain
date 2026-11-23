// 76-17-⑥-⑤ / M32 — minimal independent QuickNode BSC Testnet archive capability gate.
// Strictly read-only. NEVER prints RPC endpoint or secret-bearing error messages.
import {writeFileSync} from "node:fs";
import {ethers} from "ethers";
import {pathToFileURL} from "node:url";

export const ANCHOR=Object.freeze({
 chainId:97,
 snapshotBlock:144115366,
 snapshotHash:"0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208",
 knownTx:"0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1",
 depositBlock:131978250,
 depositBlockHash:"0x01b0845e57355ca1ec63f7948bf738cd91b654c0a8c7c1e179ba5e3fdc26aaf5",
 token:"0x7ab1b97d194730e9456c12af7905450a4f8a0c46",
 vault:"0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
 user:"0xde05e09db1292aff6ab62164134f1ad384bca6fb",
 expectedAmount:"5000000000000000000000"
});
const lower=v=>String(v??"").toLowerCase();
const hex=n=>"0x"+n.toString(16);
const isHex=(value,bytes)=>typeof value==="string"&&new RegExp("^0x[0-9a-fA-F]{"+(bytes*2)+"}$").test(value);
const has=(record,k)=>Object.prototype.hasOwnProperty.call(record,k);

export function validateEndpoint(endpoint){
 if(!endpoint)return {ok:false,reason:"M32_QUICKNODE_BSC_TESTNET_RPC_URL is not configured"};
 try{
  const url=new URL(endpoint);
  if(url.protocol!=="https:"||url.username||url.password||url.port||
     url.search||url.hash||!/(^|\.)quiknode\.pro$/i.test(url.hostname))return {
      ok:false,reason:"Endpoint must use approved QuickNode HTTPS hostname without query credentials"};
  if(url.pathname==="/"||url.pathname.length<2)return {
   ok:false,reason:"A dedicated credential-bearing QuickNode endpoint path is required"};
  return {ok:true};
 }catch{return {ok:false,reason:"Invalid QuickNode URL format"};}
}

function base(){
 return {schema:"lqc-m32-quicknode-archive-probe-v1",status:"BLOCKED",
  provider:"QuickNode",network:"BSC Testnet",chainId:ANCHOR.chainId,
  targetBlock:ANCHOR.snapshotBlock,fullRangeScanned:false,
  configured:false,checks:[],lastSuccessfulCheck:null,
  confirmed:[],blocked:[],archiveStateAvailable:false,
  knownReceiptMatches:false,oneBlockLogsAvailable:false,
  provenDistributableSurplus:"0",fullHistoricalInventoryComplete:false,
  economicEntitlementVerified:false,payoutAuthorized:false,
  signingPerformed:false,transactionOccurred:false,mainModified:false};
}
const check=(out,name,passed)=>{out.checks.push({name,status:passed?"PASS":"BLOCKED"});if(passed)out.confirmed.push(name);else out.blocked.push(name);return passed;};
const bn=x=>BigInt(x);
const DEPOSIT_TOPIC=ethers.id("Deposit(address,address,uint256)");
function confirmKnownReceipt(r){
 if(!r||bn(r.status)!==1n||bn(r.blockNumber)!==BigInt(ANCHOR.depositBlock)||
   lower(r.blockHash)!==ANCHOR.depositBlockHash||!Array.isArray(r.logs))
  return false;
 const transferTopic="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
 // ERC20 Transfer(address,address,uint256): indexed from/to, 32-byte amount.
 const transfer=r.logs.find(l=>bn(l.logIndex)===6n&&lower(l.address)===ANCHOR.token);
 const deposit=r.logs.find(l=>bn(l.logIndex)===7n&&lower(l.address)===ANCHOR.vault);
 if(!transfer||!deposit||lower(transfer.topics?.[0])!==transferTopic||
    lower(transfer.topics?.[1])!=="0x"+ANCHOR.user.slice(2).padStart(64,"0")||
    lower(transfer.topics?.[2])!=="0x"+ANCHOR.vault.slice(2).padStart(64,"0")||
    !isHex(transfer.data,32)||bn(transfer.data)!==bn(ANCHOR.expectedAmount))return false;
 // Deposit(account indexed,token indexed,uint amount) has both indexed accounts and data amount.
 // Check data/address pair based on M28 known evidence; leave cryptographic event topic validation to M31.
 if(!Array.isArray(deposit.topics)||deposit.topics.length!==3||
    lower(deposit.topics[0])!==DEPOSIT_TOPIC||
    lower(deposit.topics[1])!=="0x"+ANCHOR.user.slice(2).padStart(64,"0")||
    lower(deposit.topics[2])!=="0x"+ANCHOR.token.slice(2).padStart(64,"0")||
    !isHex(deposit.data,32)||bn(deposit.data)!==bn(ANCHOR.expectedAmount))return false;
 return true;
}
export async function probeM32(endpoint,request){
 const out=base();
 const gate=validateEndpoint(endpoint);
 if(!gate.ok){out.blocked.push("NO_AUTHENTICATED_ENDPOINT");out.reason=gate.reason;return out;}
 out.configured=true;
 // Stop at first failed check. Do not perform expensive queries after failed identity.
 try{
  const chain=await request("eth_chainId",[]);
  if(!check(out,"CHAIN_97",bn(chain)===97n)){out.reason="Wrong chain";return out;}
  const block=await request("eth_getBlockByNumber",[hex(ANCHOR.snapshotBlock),false]);
  if(!check(out,"FROZEN_HASH",lower(block?.hash)===ANCHOR.snapshotHash)){
   out.reason="Frozen block hash not available or mismatched";return out;
  }
  const receipt=await request("eth_getTransactionReceipt",[ANCHOR.knownTx]);
  out.knownReceiptMatches=confirmKnownReceipt(receipt);
  if(!check(out,"KNOWN_DEPOSIT_RECEIPT",out.knownReceiptMatches)){
   out.reason="Known deposit receipt was not independently confirmed";return out;
  }
  const logs=await request("eth_getLogs",[{address:ANCHOR.vault,
   fromBlock:hex(ANCHOR.depositBlock),toBlock:hex(ANCHOR.depositBlock)}]);
  out.oneBlockLogsAvailable=Array.isArray(logs)&&logs.some(l=>
    lower(l.transactionHash)===ANCHOR.knownTx&&bn(l.logIndex)===7n&&
    bn(l.blockNumber)===BigInt(ANCHOR.depositBlock)&&
    lower(l.blockHash)===ANCHOR.depositBlockHash&&
    lower(l.address)===ANCHOR.vault&&
    Array.isArray(l.topics)&&l.topics.length===3&&
    lower(l.topics[0])===DEPOSIT_TOPIC&&
    lower(l.topics[1])==="0x"+ANCHOR.user.slice(2).padStart(64,"0")&&
    lower(l.topics[2])==="0x"+ANCHOR.token.slice(2).padStart(64,"0")&&
    isHex(l.data,32)&&bn(l.data)===bn(ANCHOR.expectedAmount));
  if(!check(out,"ONE_BLOCK_VAULT_LOGS",out.oneBlockLogsAvailable)){
   out.reason="One-block historical Vault logs not available";return out;
  }
  const data="0x70a08231"+ANCHOR.vault.slice(2).padStart(64,"0");
  const result=await request("eth_call",[{to:ANCHOR.token,data},hex(ANCHOR.snapshotBlock)]);
  out.archiveStateAvailable=isHex(result,32)&&bn(result)===bn(ANCHOR.expectedAmount);
  if(!check(out,"FROZEN_TOKEN_BALANCE",out.archiveStateAvailable)){
   out.reason="Archive state response did not match M08 reference";return out;
  }
  out.status="SMALL_READ_ONLY_ARCHIVE_PROBE_PASS__FULL_HISTORY_BLOCKED";
  out.reason="The provider passed a few pinned historical observations, NOT complete archive coverage or economic title.";
 }catch{
  // No endpoint, request payload, token, auth header or error message may enter logs.
  out.blocked.push("PROVIDER_REQUEST_ERROR");
  out.reason="Historical provider request failed; raw URL and error intentionally redacted.";
 }
 out.lastSuccessfulCheck=out.confirmed.at(-1)||null;
 return out;
}
async function requestUsingEndpoint(endpoint,method,params){
 const ctl=new AbortController(),id=setTimeout(()=>ctl.abort(),11000);
 try{
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:ctl.signal});
  if(!response.ok)throw Error("HTTP ERROR REDACTED");
  const obj=await response.json();
  if(obj.error||!has(obj,"result"))throw Error("RPC ERROR REDACTED");
  return obj.result;
 }finally{clearTimeout(id);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const endpoint=process.env.M32_QUICKNODE_BSC_TESTNET_RPC_URL;
 const result=await probeM32(endpoint,(method,params)=>requestUsingEndpoint(endpoint,method,params));
 writeFileSync("futures-m32-quicknode-probe.json",JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify(result,null,2)); // NEVER includes private endpoint
}
