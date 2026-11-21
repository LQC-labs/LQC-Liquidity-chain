// M08 historic testnet account discovery, bounded read-only observation.
// This script intentionally does NOT claim complete lifetime inventory.
import { ethers } from "ethers";
import { writeFileSync } from "node:fs";

const rpc = process.env.BSC_TESTNET_READONLY_RPC || "https://bsc-testnet-dataseed.bnbchain.org";
const provider = new ethers.JsonRpcProvider(rpc,97,{staticNetwork:true});
const ENGINE = "0xe4f1320c8709631776c7e39e0916584935882525";
const VAULT = "0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const DEPLOY_TX = "0x16a112f0cdfa053e9af81eb56ebfb00ee91dd7538b003addf7069028ab41c870";
const MARKET = 1n;
const COLLATERAL = "0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const MAX_BLOCKS = 2000;
const CHUNK = 100;
const iface = new ethers.Interface([
  "event PositionOpened(address indexed account,uint256 indexed marketId,bool isLong,uint256 margin,uint256 sizeUsd,uint256 entryPrice)",
  "event PositionClosed(address indexed account,uint256 indexed marketId,uint256 exitPrice,int256 pnl)",
  "event PositionLiquidated(address indexed account,uint256 indexed marketId,address indexed liquidator,uint256 price,int256 pnl)",
  "function positions(address,uint256) view returns (uint256 margin,uint256 sizeUsd,uint256 entryPrice,bool isLong,bool open)"
]);
const vaultInterface = new ethers.Interface([
  "event Deposit(address indexed account,address indexed token,uint256 amount)",
  "event Withdrawal(address indexed account,address indexed token,uint256 amount)",
  "event CollateralLocked(address indexed account,address indexed token,uint256 amount)",
  "event CollateralUnlocked(address indexed account,address indexed token,uint256 amount)",
  "function availableBalance(address,address) view returns(uint256)",
  "function lockedBalance(address,address) view returns(uint256)"
]);
const result = {
  schema:"lqc-futures-m08-historical-position-events-v1",
  chainIdExpected:97, signingPerformed:false,transactionOccurred:false,
  migrationGate:"BLOCKED", accountInventoryComplete:false,
  note:"Bounded discovery only: a partial log window is never proof of zero open positions."
};
const topics = ["PositionOpened","PositionClosed","PositionLiquidated"].map(x=>iface.getEvent(x).topicHash);
const vaultTopics = ["Deposit","Withdrawal","CollateralLocked","CollateralUnlocked"].map(x=>vaultInterface.getEvent(x).topicHash);
async function call(address,ab,fn,args,block) {
  const raw=await provider.call({to:address,data:ab.encodeFunctionData(fn,args)},block);
  return ab.decodeFunctionResult(fn,raw);
}
async function run() {
  if(BigInt(await provider.send("eth_chainId",[]))!==97n) throw Error("wrong chain");
  const receipt = await provider.getTransactionReceipt(DEPLOY_TX);
  if(!receipt || receipt.status!==1 || receipt.contractAddress?.toLowerCase()!==ENGINE) throw Error("deployment receipt mismatch");
  const start = receipt.blockNumber;
  const block=await provider.getBlockNumber();
  const snapshot=await provider.getBlock(block);
  if(!snapshot?.hash) throw Error("snapshot block unavailable");
  const end=Math.min(block,start+MAX_BLOCKS-1);
  Object.assign(result,{deploymentBlock:start,snapshotBlock:block,snapshotHash:snapshot.hash,
    scannedFrom:start,scannedThrough:end,completeFromDeploymentThroughSnapshot:end===block,
    events:[],accounts:[],status:"BLOCKED_PARTIAL_WINDOW"});
  const seen=new Set();
  for(let s=start;s<=end;s+=CHUNK) {
    const e=Math.min(s+CHUNK-1,end);
    for(const [contract,topicSet,ab] of [[ENGINE,topics,iface],[VAULT,vaultTopics,vaultInterface]]) {
      let logs;
      try {
        logs=await provider.getLogs({address:contract,fromBlock:s,toBlock:e,topics:[topicSet]});
      } catch (err) {
        // Public endpoints may reject even small eth_getLogs windows. Never infer zero events.
        const message=String(err?.shortMessage||err?.message||err);
        result.logQueryFailure={contract:contract===ENGINE?"Engine":"Vault",fromBlock:s,toBlock:e,error:message.slice(0,300)};
        throw Error("eth_getLogs rejected the bounded request; event inventory incomplete");
      }
      for(const log of logs) {
        const parsed=ab.parseLog(log);
        if(!parsed) continue;
        const account=parsed.args.account?.toLowerCase();
        if(account)seen.add(account);
        result.events.push({contract:contract===ENGINE?"Engine":"Vault",name:parsed.name,
          account:account||null,blockNumber:log.blockNumber,transactionHash:log.transactionHash});
      }
    }
  }
  for(const account of [...seen].sort()) {
    const [p,a,l]=await Promise.all([
      call(ENGINE,iface,"positions",[account,MARKET],block),
      call(VAULT,vaultInterface,"availableBalance",[account,COLLATERAL],block),
      call(VAULT,vaultInterface,"lockedBalance",[account,COLLATERAL],block)
    ]);
    result.accounts.push({account,position:{margin:p[0].toString(),sizeUsd:p[1].toString(),
      entryPrice:p[2].toString(),isLong:p[3],open:p[4]},
      availableBalance:a[0].toString(),lockedBalance:l[0].toString()});
  }
  result.discoveredAccounts=result.accounts.length;
  result.openPositionsAmongDiscovered=result.accounts.filter(a=>a.position.open).length;
  result.status=end===block?"READ_ONLY_LOG_RANGE_COMPLETE_NEEDS_EXTERNAL_RECONCILIATION":"READ_ONLY_PARTIAL_WINDOW";
  result.reason=end===block?"Historical event logs require independent completeness review":
    "Only first "+MAX_BLOCKS+" deployment blocks scanned; later accounts or position changes may exist.";
}
try {await run();} catch(e) {result.status="BLOCKED";result.reason=String(e?.message||e).slice(0,600);}
writeFileSync("futures-m08-historical-positions.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({status:result.status,scannedFrom:result.scannedFrom,scannedThrough:result.scannedThrough,
  snapshotBlock:result.snapshotBlock,discoveredAccounts:result.discoveredAccounts,
  openPositionsAmongDiscovered:result.openPositionsAmongDiscovered,reason:result.reason},null,2));
