import fs from "node:fs";import { ethers } from "ethers";
const RPCS=["https://bsc-testnet.drpc.org","https://data-seed-prebsc-1-s1.bnbchain.org:8545"];
const ROUTER="0xA3E1fbe94055e7A8971b3994C7025B3c16273a24";
const TLQC="0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc";
const WBNB="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
async function provider(){for(const u of RPCS){try{const p=new ethers.JsonRpcProvider(u,97,{staticNetwork:true});if(Number((await p.getNetwork()).chainId)===97)return p}catch{}}throw Error("No reviewed BSC Testnet RPC available")}
let p=await provider();
async function rpc(fn){try{return await fn(p)}catch(first){const alt=RPCS.find(u=>u!==p._getConnection?.().url);if(!alt)throw first;p=new ethers.JsonRpcProvider(alt,97,{staticNetwork:true});return await fn(p)}}
const router=new ethers.Contract(ROUTER,["function factory() view returns(address)"],p);
const factoryAddr=await rpc(()=>router.connect(p).factory());
const factory=new ethers.Contract(factoryAddr,["function getPair(address,address) view returns(address)"],p);
const pairAddr=await rpc(()=>factory.connect(p).getPair(TLQC,WBNB)); if(pairAddr===ethers.ZeroAddress)throw Error("pair missing");
const latest=await rpc(x=>x.getBlockNumber());
const creationSearchFloor=120000000;
async function findCreation(address){
  let lo=creationSearchFloor,hi=latest;
  if((await rpc(x=>x.getCode(address,lo)))!=="0x") return {lowerBound:lo,note:"code already existed at search floor"};
  while(lo+1<hi){const mid=Math.floor((lo+hi)/2); if((await rpc(x=>x.getCode(address,mid)))==="0x")lo=mid;else hi=mid}
  return {firstCodeBlock:hi};
}
const pairCreation=await findCreation(pairAddr);
const fromBlock=pairCreation.firstCodeBlock??creationSearchFloor;
const topic0s={
 Mint:ethers.id("Mint(address,uint256,uint256)"),
 Burn:ethers.id("Burn(address,uint256,uint256,address)"),
 Swap:ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)")
};
const logs={};
for(const [name,topic] of Object.entries(topic0s)){
  const xs=await rpc(x=>x.getLogs({address:pairAddr,topics:[topic],fromBlock,toBlock:"latest"}));
  logs[name]=xs.map(x=>({transactionHash:x.transactionHash,blockNumber:x.blockNumber,logIndex:x.index}));
}
const known=JSON.parse(fs.readFileSync(new URL("../deployments/router2-lqc-flow-execution-bsc-testnet-97.json",import.meta.url),"utf8"));
const knownReceipt=await rpc(x=>x.getTransactionReceipt(known.transactionHash));
const result={status:"READ_ONLY",chainId:97,addresses:{router:ROUTER,factory:factoryAddr,pair:pairAddr,tLQC:TLQC,wbnb:WBNB},latestBlock:latest,pairCreation,events:logs,knownRouter2Flow:{transactionHash:known.transactionHash,receiptStatus:knownReceipt?.status??null,blockNumber:knownReceipt?.blockNumber??null},classification:{liquidityRoundTripCandidate:logs.Mint.length>0&&logs.Burn.length>0,nativeDirectionEvidence:"event logs alone cannot prove native unwrap/wrap direction; transaction calldata/value recovery required"},safety:"eth_call/getCode/getLogs/getTransactionReceipt only; no wallet, signature, approval, transfer or transaction"};
console.log(JSON.stringify(result,null,2));
