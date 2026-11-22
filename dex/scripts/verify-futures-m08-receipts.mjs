// M08 independent receipt reconciliation (read-only); no signer or transactions.
import { ethers } from "ethers";
import { writeFileSync } from "node:fs";
const provider=new ethers.JsonRpcProvider(
  process.env.BSC_TESTNET_READONLY_RPC || "https://bsc-testnet-rpc.publicnode.com",97,{staticNetwork:true});
const ENGINE="0xe4f1320c8709631776c7e39e0916584935882525";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const ACCOUNT="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const BLOCK=144115366, FROM=131945356;
const deploy={
  Engine:"0x16a112f0cdfa053e9af81eb56ebfb00ee91dd7538b003addf7069028ab41c870",
  Vault:"0x263e7d9135a646caa958e3a317867a13f056e0c712ddd9429d9b432a2d45cda0"
};
const events=[
  {tx:"0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1",idx:7,kind:"Vault",name:"Deposit"},
  {tx:"0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4",idx:11,kind:"Vault",name:"CollateralLocked"},
  {tx:"0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4",idx:12,kind:"Engine",name:"PositionOpened"},
  {tx:"0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19",idx:13,kind:"Vault",name:"CollateralUnlocked"},
  {tx:"0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19",idx:14,kind:"Engine",name:"PositionClosed"}
];
const abi=new ethers.Interface([
 "event PositionOpened(address indexed account,uint256 indexed marketId,bool isLong,uint256 margin,uint256 sizeUsd,uint256 entryPrice)",
 "event PositionClosed(address indexed account,uint256 indexed marketId,uint256 exitPrice,int256 pnl)",
 "event Deposit(address indexed account,address indexed token,uint256 amount)",
 "event CollateralLocked(address indexed account,address indexed token,uint256 amount)",
 "event CollateralUnlocked(address indexed account,address indexed token,uint256 amount)"
]);
const engineAbi=new ethers.Interface(["function positions(address,uint256) view returns(uint256,uint256,uint256,bool,bool)"]);
const vaultAbi=new ethers.Interface([
  "function availableBalance(address,address) view returns(uint256)",
  "function lockedBalance(address,address) view returns(uint256)",
  "function totalAccounted(address) view returns(uint256)"
]);
const tokenAbi=new ethers.Interface(["function balanceOf(address) view returns(uint256)"]);
const result={schema:"lqc-m08-independent-receipt-reconciliation-v1",chainId:97,
  snapshotBlock:BLOCK,fromBlock:FROM,status:"BLOCKED",migrationGate:"BLOCKED",
  transactionOccurred:false,signingPerformed:false,operationalCutoverAuthorized:false,checks:[]};
async function call(to,iface,name,args){
  const raw=await provider.call({to,data:iface.encodeFunctionData(name,args)},BLOCK);
  return iface.decodeFunctionResult(name,raw);
}
try {
  if(BigInt(await provider.send("eth_chainId",[]))!==97n)throw Error("chain mismatch");
  const b=await provider.getBlock(BLOCK);
  if(!b?.hash)throw Error("snapshot block unavailable");
  result.snapshotHash=b.hash;
  result.deployments=[];
  for(const [kind,tx] of Object.entries(deploy)){
    const r=await provider.getTransactionReceipt(tx),addr=kind==="Engine"?ENGINE:VAULT;
    if(!r||r.status!==1||r.contractAddress?.toLowerCase()!==addr)throw Error(kind+" deploy receipt mismatch");
    result.deployments.push({kind,block:r.blockNumber,contract:addr});
    if(r.blockNumber>FROM)throw Error(kind+" deployed after scan lower bound");
  }
  for(const tx of [...new Set(events.map(e=>e.tx))]){
    const r=await provider.getTransactionReceipt(tx);
    if(!r||r.status!==1)throw Error("event transaction receipt unavailable");
    for(const e of events.filter(x=>x.tx===tx)){
      const log=r.logs.find(x=>x.index===e.idx);
      const expected=e.kind==="Engine"?ENGINE:VAULT;
      if(!log||log.address.toLowerCase()!==expected)throw Error("receipt address/log index mismatch "+e.name);
      const parsed=abi.parseLog(log);
      if(parsed?.name!==e.name||String(parsed.args.account).toLowerCase()!==ACCOUNT)
        throw Error("receipt event/account mismatch "+e.name);
      result.checks.push({name:e.name,block:log.blockNumber,tx,logIndex:e.idx,receiptVerified:true});
    }
  }
  const [position,avail,locked,total,actual]=await Promise.all([
    call(ENGINE,engineAbi,"positions",[ACCOUNT,1]),
    call(VAULT,vaultAbi,"availableBalance",[ACCOUNT,TOKEN]),
    call(VAULT,vaultAbi,"lockedBalance",[ACCOUNT,TOKEN]),
    call(VAULT,vaultAbi,"totalAccounted",[TOKEN]),
    call(TOKEN,tokenAbi,"balanceOf",[VAULT])
  ]);
  result.knownAccount={account:ACCOUNT,open:position[4],margin:position[0].toString(),sizeUsd:position[1].toString(),
    availableBalance:avail[0].toString(),lockedBalance:locked[0].toString()};
  result.vault={totalAccounted:total[0].toString(),actualTokenBalance:actual[0].toString()};
  if(position[4]||position[0]!==0n||position[1]!==0n||locked[0]!==0n)
    throw Error("known account not flat at pinned block");
  if(avail[0]!==total[0]||total[0]!==actual[0])
    throw Error("account balance does not reconcile to Vault for supplied token");
  result.status="KNOWN_ACCOUNT_RECEIPTS_AND_BALANCES_PASS";
  result.reason="All five indexed logs verified against receipts and known-account balance reconciles; independent full account enumeration still required.";
}catch(e){result.status="BLOCKED";result.reason=String(e?.shortMessage||e?.message||e).slice(0,330);}
writeFileSync("futures-m08-receipt-crosscheck.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({status:result.status,reason:result.reason,snapshotBlock:BLOCK,
  receiptsVerified:result.checks.length,deployments:result.deployments,
  knownAccount:result.knownAccount,vault:result.vault},null,2));
