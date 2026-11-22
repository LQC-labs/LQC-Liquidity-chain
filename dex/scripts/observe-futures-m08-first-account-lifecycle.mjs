// M08 — bounded historic first-account position lifecycle read-only investigation.
// Does not claim completeness beyond the scanned range. No keys, signing, or transactions.
import { ethers } from "ethers";
import { writeFileSync } from "node:fs";

const provider = new ethers.JsonRpcProvider(
  process.env.BSC_TESTNET_READONLY_RPC || "https://bsc-testnet-rpc.publicnode.com",
  97,
  { staticNetwork: true }
);
const ENGINE = "0xe4f1320c8709631776c7e39e0916584935882525";
const VAULT = "0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const TOKEN = "0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const ACCOUNT = "0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const FIRST_OPEN_TX = "0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4";
const MAX_BLOCKS = 150000;
const CHUNK_SIZE = 2500;
const iface = new ethers.Interface([
  "event PositionOpened(address indexed account,uint256 indexed marketId,bool isLong,uint256 margin,uint256 sizeUsd,uint256 entryPrice)",
  "event PositionClosed(address indexed account,uint256 indexed marketId,uint256 exitPrice,int256 pnl)",
  "event PositionLiquidated(address indexed account,uint256 indexed marketId,address indexed liquidator,uint256 price,int256 pnl)",
  "function positions(address,uint256) view returns(uint256 margin,uint256 sizeUsd,uint256 entryPrice,bool isLong,bool open)"
]);
const vaultAbi = new ethers.Interface([
  "function availableBalance(address,address) view returns(uint256)",
  "function lockedBalance(address,address) view returns(uint256)"
]);
const result = {
  schema:"lqc-futures-m08-first-account-lifecycle-v1",
  account: ACCOUNT.toLowerCase(), historicalEngine: ENGINE,
  observedEvents: [], transactionOccurred:false, signingPerformed:false,
  operationalCutoverAuthorized:false, accountInventoryComplete:false,
  migrationGate:"BLOCKED", status:"BLOCKED"
};
function plain(v) { return typeof v==="bigint"?v.toString():v; }
async function read(to,ab,name,args,blockTag) {
  return ab.decodeFunctionResult(name,await provider.call({
    to,data:ab.encodeFunctionData(name,args)},blockTag));
}
async function run() {
  if(BigInt(await provider.send("eth_chainId",[]))!==97n) throw Error("Chain ID mismatch");
  const receipt=await provider.getTransactionReceipt(FIRST_OPEN_TX);
  if(!receipt || receipt.status!==1) throw Error("First open receipt missing/failed");
  const opening=receipt.logs.find(l=>l.address.toLowerCase()===ENGINE);
  if(!opening) throw Error("First opening receipt contains no Engine log");
  const firstParsed=iface.parseLog(opening);
  if(firstParsed?.name!=="PositionOpened" || firstParsed.args.account.toLowerCase()!==ACCOUNT.toLowerCase()) {
    throw Error("First opening log identity mismatch");
  }
  const tip=await provider.getBlockNumber();
  const tipBlock=await provider.getBlock(tip);
  if(!tipBlock?.hash) throw Error("Tip block missing");
  const from=receipt.blockNumber;
  const to=Math.min(tip,from+MAX_BLOCKS-1);
  Object.assign(result,{startBlock:from,scannedThrough:null,latestBlock:tip,latestHash:tipBlock.hash,
    scanScope:"KNOWN_TEST_ACCOUNT_ONLY",coveredAllHistory:false});
  const topics=[["PositionOpened","PositionClosed","PositionLiquidated"].map(n=>iface.getEvent(n).topicHash),
    ethers.zeroPadValue(ACCOUNT,32)];
  for(let start=from;start<=to;start+=CHUNK_SIZE) {
    const end=Math.min(start+CHUNK_SIZE-1,to);
    const logs=await provider.getLogs({
      address:ENGINE,fromBlock:start,toBlock:end,topics
    });
    for(const log of logs) {
      const p=iface.parseLog(log);
      if(!p) throw Error("Unknown historical Engine event");
      result.observedEvents.push({
        name:p.name,blockNumber:log.blockNumber,
        transactionHash:log.transactionHash,logIndex:log.index,
        account:p.args.account.toLowerCase(),marketId:p.args.marketId.toString()
      });
    }
    result.scannedThrough=end;
  }
  const [position,available,locked]=await Promise.all([
    read(ENGINE,iface,"positions",[ACCOUNT,1],tip),
    read(VAULT,vaultAbi,"availableBalance",[ACCOUNT,TOKEN],tip),
    read(VAULT,vaultAbi,"lockedBalance",[ACCOUNT,TOKEN],tip)
  ]);
  result.currentKnownAccount={
    position:{margin:plain(position[0]),sizeUsd:plain(position[1]),
      entryPrice:plain(position[2]),isLong:position[3],open:position[4]},
    availableBalance:plain(available[0]),lockedBalance:plain(locked[0])
  };
  result.coveredAllHistory=to===tip;
  result.lifecycleEvents=result.observedEvents.length;
  result.status="READ_ONLY_PARTIAL_LIFECYCLE";
  result.reason=result.coveredAllHistory
    ?"Known-account events scanned through tip, but other accounts not discovered"
    :"Known-account scan ends before tip; later closure/activity may not appear in scanned logs";
} 
try { await run(); }
catch(e) {
  result.status="BLOCKED";
  result.reason=String(e?.shortMessage||e?.message||e).slice(0,600);
}
writeFileSync("futures-m08-first-account-lifecycle.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({status:result.status,from:result.startBlock,through:result.scannedThrough,
 events:result.lifecycleEvents,knownPosition:result.currentKnownAccount?.position,reason:result.reason},null,2));
