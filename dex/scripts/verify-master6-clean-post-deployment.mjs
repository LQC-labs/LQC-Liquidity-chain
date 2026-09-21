import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

const RPCS=[
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545"
];
const ZERO=ethers.ZeroAddress;
const readJson=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),"utf8"));
const addr=value=>ethers.getAddress(value);
const eq=(a,b)=>addr(a).toLowerCase()===addr(b).toLowerCase();
const iface=new ethers.Interface([
  "function owner() view returns(address)",
  "function guardian() view returns(address)",
  "function oracle() view returns(address)",
  "function rateModel() view returns(address)",
  "function core() view returns(address)",
  "function registry() view returns(address)",
  "function interestIndex() view returns(address)",
  "function liquidationEngine() view returns(address)",
  "function decimals() view returns(uint8)",
  "function answer() view returns(int256)",
  "function assetConfigs(address) view returns(address primary,address secondary,uint32 maxAge,uint16 maxDeviationBps,bool enabled)",
  "function rateConfigs(bytes32) view returns(uint16 baseAprBps,uint16 slope1AprBps,uint16 slope2AprBps,uint16 optimalUtilizationBps,uint16 reserveFactorBps,bool enabled)",
  "function indexStates(bytes32) view returns(uint128 borrowIndexRay,uint128 supplyIndexRay,uint64 lastAccrued)",
  "function getMarket(bytes32) view returns((address collateralAsset,address debtAsset,uint8 collateralDecimals,uint8 debtDecimals,uint16 maxLtvBps,uint16 liquidationThresholdBps,uint16 liquidationBonusBps,uint128 supplyCap,uint128 borrowCap,uint128 minBorrow,bool enabled))"
]);

async function call(provider,to,fn,args=[]){
  const data=iface.encodeFunctionData(fn,args);
  const raw=await provider.call({to,data});
  return iface.decodeFunctionResult(fn,raw);
}
function validatePacket(live,evidence){
  const {executionPacketDigest,...liveBody}=live;
  if(live.recordType!=="LQC_MASTER6_LIVE_EXECUTION_PACKET"||live.status!=="APPROVED_FOR_WALLET_CONFIRMATION"||live.network?.chainId!==97) throw Error("Invalid Master 6 live packet");
  if(canonicalDigest(liveBody)!==executionPacketDigest) throw Error("Master 6 live packet digest mismatch");
  if(live.executionAuthorized!==true||live.activationAuthorized!==false||live.packet?.market?.enabled!==false) throw Error("Master 6 authorization boundary mismatch");
  if(live.packet?.startingNonce!=="17"||live.packet?.deployments?.length!==10) throw Error("Master 6 deployment packet shape mismatch");
  if(evidence.recordType!=="LQC_MASTER6_CLEAN_POST_DEPLOYMENT_EVIDENCE"||evidence.network?.chainId!==97||evidence.activationAuthorized!==false) throw Error("Invalid post-deployment evidence");
  if(!eq(evidence.deployer,live.deployer)||evidence.startingNonce!=="17"||evidence.finalPendingNonce!=="27"||evidence.transactions?.length!==10) throw Error("Post-deployment evidence boundary mismatch");
  if(new Set(evidence.transactions.map(x=>x.hash.toLowerCase())).size!==10||evidence.transactions.some(x=>!ethers.isHexString(x.hash,32))) throw Error("Post-deployment transaction hashes invalid");
  for(let i=0;i<10;i++){
    const tx=evidence.transactions[i],d=live.packet.deployments[i];
    if(tx.order!==i+1||tx.label!==d.label||tx.nonce!==d.deployerNonce) throw Error("Post-deployment transaction ordering mismatch #"+(i+1));
  }
}
async function currentBindings(provider,live){
  const d=Object.fromEntries(live.packet.deployments.map(x=>[x.label,addr(x.predictedAddress)]));
  const roles=live.packet.roles;
  const market=live.packet.market;
  const marketId=market.marketId||ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address","address"],[market.collateralAsset,market.debtAsset]));
  const feeds={};
  for(const label of ["CollateralPrimaryFeed","CollateralSecondaryFeed","DebtPrimaryFeed","DebtSecondaryFeed"]){
    const owner=(await call(provider,d[label],"owner"))[0];
    const decimals=Number((await call(provider,d[label],"decimals"))[0]);
    const answer=(await call(provider,d[label],"answer"))[0];
    if(!eq(owner,roles.governanceSafe)||decimals!==8||answer<=0n) throw Error(label+" binding mismatch");
    feeds[label]={owner:addr(owner),decimals,answer:String(answer)};
  }
  const oracleOwner=(await call(provider,d.LQCOracleManager,"owner"))[0],oracleGuardian=(await call(provider,d.LQCOracleManager,"guardian"))[0];
  if(!eq(oracleOwner,roles.governanceSafe)||!eq(oracleGuardian,roles.guardianSafe)) throw Error("Oracle Manager role binding mismatch");
  for(const asset of [market.collateralAsset,market.debtAsset]){
    const cfg=await call(provider,d.LQCOracleManager,"assetConfigs",[asset]);
    if(cfg[0]!==ZERO||cfg[1]!==ZERO||cfg[4]!==false) throw Error("Oracle configuration occurred before governance gate");
  }
  const rateOwner=(await call(provider,d.LQCInterestRateModel,"owner"))[0],rateGuardian=(await call(provider,d.LQCInterestRateModel,"guardian"))[0];
  if(!eq(rateOwner,roles.governanceSafe)||!eq(rateGuardian,roles.guardianSafe)) throw Error("Rate Model role binding mismatch");
  const rateCfg=await call(provider,d.LQCInterestRateModel,"rateConfigs",[marketId]);
  if(rateCfg[5]!==false||rateCfg.slice(0,5).some(x=>x!==0n)) throw Error("Rate configuration occurred before governance gate");
  const regOwner=(await call(provider,d.LQCLendingMarketRegistry,"owner"))[0],regGuardian=(await call(provider,d.LQCLendingMarketRegistry,"guardian"))[0],regOracle=(await call(provider,d.LQCLendingMarketRegistry,"oracle"))[0];
  if(!eq(regOwner,roles.governanceSafe)||!eq(regGuardian,roles.guardianSafe)||!eq(regOracle,d.LQCOracleManager)) throw Error("Market Registry binding mismatch");
  let marketConfigured=true;
  try{await call(provider,d.LQCLendingMarketRegistry,"getMarket",[marketId]);}catch{marketConfigured=false;}
  if(marketConfigured) throw Error("Market configured before governance gate");
  const indexOwner=(await call(provider,d.LQCLendingInterestIndex,"owner"))[0],indexRate=(await call(provider,d.LQCLendingInterestIndex,"rateModel"))[0],indexCore=(await call(provider,d.LQCLendingInterestIndex,"core"))[0];
  if(!eq(indexOwner,roles.governanceSafe)||!eq(indexRate,d.LQCInterestRateModel)||indexCore!==ZERO) throw Error("Interest Index pre-configuration binding mismatch");
  const indexState=await call(provider,d.LQCLendingInterestIndex,"indexStates",[marketId]);
  if(indexState.some(x=>x!==0n)) throw Error("Interest Index initialized before governance gate");
  const coreOwner=(await call(provider,d.LQCLendingCore,"owner"))[0],coreRegistry=(await call(provider,d.LQCLendingCore,"registry"))[0],coreIndex=(await call(provider,d.LQCLendingCore,"interestIndex"))[0],liq=(await call(provider,d.LQCLendingCore,"liquidationEngine"))[0];
  if(!eq(coreOwner,roles.governanceSafe)||!eq(coreRegistry,d.LQCLendingMarketRegistry)||!eq(coreIndex,d.LQCLendingInterestIndex)||liq!==ZERO) throw Error("Lending Core pre-configuration binding mismatch");
  const engineCore=(await call(provider,d.LQCLiquidationEngine,"core"))[0];
  if(!eq(engineCore,d.LQCLendingCore)) throw Error("Liquidation Engine binding mismatch");
  return {marketId,feeds,oracleManager:{owner:addr(oracleOwner),guardian:addr(oracleGuardian)},rateModel:{owner:addr(rateOwner),guardian:addr(rateGuardian)},marketRegistry:{owner:addr(regOwner),guardian:addr(regGuardian),oracle:addr(regOracle),marketConfigured:false},interestIndex:{owner:addr(indexOwner),rateModel:addr(indexRate),core:ZERO,initialized:false},lendingCore:{owner:addr(coreOwner),registry:addr(coreRegistry),interestIndex:addr(coreIndex),liquidationEngine:ZERO},liquidationEngine:{core:addr(engineCore)},activationAuthorized:false};
}

export async function verifyMaster6PostDeployment({providers,live,evidence,minConfirmations=3}){
  validatePacket(live,evidence);
  if(!Array.isArray(providers)||providers.length<2||minConfirmations<3) throw Error("Use 2+ BSC Testnet RPCs and at least 3 confirmations");
  const observations=[];
  for(const provider of providers){
    if(Number((await provider.getNetwork()).chainId)!==97) throw Error("BSC Testnet chain mismatch");
    const head=await provider.getBlockNumber();
    const pendingNonce=await provider.getTransactionCount(live.deployer,"pending");
    if(pendingNonce!==27) throw Error("Final deployer pending nonce is not 27");
    const deployments=[];
    for(let i=0;i<10;i++){
      const d=live.packet.deployments[i],ev=evidence.transactions[i];
      const [tx,receipt]=await Promise.all([provider.getTransaction(ev.hash),provider.getTransactionReceipt(ev.hash)]);
      if(!tx||!receipt||receipt.status!==1) throw Error("Missing or failed deployment transaction #"+(i+1));
      if(!eq(tx.from,live.deployer)||tx.to!==null||tx.nonce!==Number(d.deployerNonce)) throw Error("Deployment transaction envelope mismatch #"+(i+1));
      if(sha256(tx.data)!==d.initCodeDigest) throw Error("Deployment init code mismatch #"+(i+1));
      if(!receipt.contractAddress||!eq(receipt.contractAddress,d.predictedAddress)) throw Error("Deployment address mismatch #"+(i+1));
      const block=await provider.getBlock(receipt.blockNumber);
      if(!block?.hash||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase()) throw Error("Canonical block mismatch #"+(i+1));
      const confirmations=head-receipt.blockNumber+1;
      if(confirmations<minConfirmations) throw Error("Insufficient confirmations #"+(i+1));
      const code=await provider.getCode(d.predictedAddress);
      if(!code||code==="0x") throw Error("Missing runtime code #"+(i+1));
      deployments.push({order:d.order,label:d.label,nonce:d.deployerNonce,transactionHash:ev.hash.toLowerCase(),blockNumber:receipt.blockNumber,blockHash:receipt.blockHash.toLowerCase(),contractAddress:addr(receipt.contractAddress),runtimeCodeDigest:sha256(code),confirmations});
    }
    observations.push({pendingNonce:String(pendingNonce),deployments,bindings:await currentBindings(provider,live)});
  }
  const stable=value=>({pendingNonce:value.pendingNonce,deployments:value.deployments.map(({confirmations,...x})=>x),bindings:value.bindings});
  const firstDigest=canonicalDigest(stable(observations[0]));
  for(const obs of observations.slice(1)) if(canonicalDigest(stable(obs))!==firstDigest) throw Error("Multi-RPC post-deployment disagreement");
  const deployments=observations[0].deployments.map((x,i)=>({...x,confirmations:Math.min(...observations.map(o=>o.deployments[i].confirmations))}));
  const body={schemaVersion:1,recordType:"LQC_MASTER6_CLEAN_POST_DEPLOYMENT_VERIFICATION",status:"VERIFIED_10_OF_10_CLEAN_DEPLOYMENT",network:{name:"BSC Testnet",chainId:97},sourceCommit:live.sourceCommit,executionPacketDigest:live.executionPacketDigest,deployer:addr(live.deployer),startingNonce:"17",finalPendingNonce:"27",rpcCount:providers.length,minConfirmations,deployments,bindings:observations[0].bindings,governanceConfigurationAuthorized:false,activationAuthorized:false,transactionOccurred:true,safety:"Read-only verification of already-broadcast deployment transactions. No Safe proposal, configuration, activation, transfer, signature or new transaction."};
  return {...body,verificationDigest:canonicalDigest(body)};
}

async function main(){
  const live=readJson("../deployments/master6-live-execution-packet-bsc-testnet-97.json");
  const evidence=readJson("../deployments/master6-clean-post-deployment-evidence-bsc-testnet-97.json");
  const providers=RPCS.map(url=>new ethers.JsonRpcProvider(url));
  const result=await verifyMaster6PostDeployment({providers,live,evidence,minConfirmations:3});
  console.log("MASTER6_POST_DEPLOYMENT_VERIFICATION_PASS");
  console.log(JSON.stringify(result,null,2));
}
if(import.meta.url===new URL("file://"+process.argv[1]).href) await main();
