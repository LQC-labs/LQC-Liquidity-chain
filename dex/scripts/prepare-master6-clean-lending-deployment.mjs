import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";
import { validateLendingTestnetConfig } from "./validate-lending-testnet-config.mjs";

function artifact(name, source) {
  return JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../artifacts/contracts/"+source+".sol/"+name+".json"), "utf8"));
}
async function initCode(name, source, args) {
  const a=artifact(name,source);
  return (await new ethers.ContractFactory(a.abi,a.bytecode).getDeployTransaction(...args)).data;
}
function predicted(deployer, nonce) {
  return ethers.getCreateAddress({from:ethers.getAddress(deployer),nonce:BigInt(nonce)});
}
function requireCommit(value){
  if(!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("sourceCommit must be a 20-byte hex pin");
  return value.toLowerCase();
}
function feedAnswers(stage0){
  const map=Object.fromEntries((stage0?.feeds||[]).map(x=>[x.id,x.answer]));
  const ids=["collateral-primary","collateral-secondary","debt-primary","debt-secondary"];
  for(const id of ids) if(!map[id]||BigInt(map[id])<=0n) throw new Error("Missing positive Stage0 feed answer: "+id);
  return ids.map(id=>map[id]);
}

export async function buildMaster6CleanDeploymentPacket({config,stage0Completion,deployer,startingNonce,sourceCommit}){
  const approved=validateLendingTestnetConfig(config);
  if(stage0Completion?.network?.chainId!==97||stage0Completion?.status!=="COMPLETE_READY_FOR_LENDING_STAGE1") throw new Error("Invalid historical Stage0 evidence");
  if(!ethers.isAddress(deployer)||deployer===ethers.ZeroAddress) throw new Error("Invalid deployer");
  const pin=requireCommit(sourceCommit);
  const nonce=BigInt(startingNonce);
  if(nonce<0n) throw new Error("Invalid starting nonce");
  const governance=approved.roles.governanceSafe, guardian=approved.roles.guardianSafe;
  const answers=feedAnswers(stage0Completion);

  const names=[
    "CollateralPrimaryFeed","CollateralSecondaryFeed","DebtPrimaryFeed","DebtSecondaryFeed",
    "LQCOracleManager","LQCInterestRateModel","LQCLendingMarketRegistry","LQCLendingInterestIndex","LQCLendingCore","LQCLiquidationEngine"
  ];
  const addrs=Object.fromEntries(names.map((n,i)=>[n,predicted(deployer,nonce+BigInt(i))]));

  const deployments=[];
  async function add(order,label,contract,source,args){
    const data=await initCode(contract,source,args);
    deployments.push({order,label,contract,source,predictedAddress:addrs[label],deployerNonce:String(nonce+BigInt(order-1)),value:"0",initCodeDigest:sha256(data),initCodeBytes:(data.length-2)/2,data});
  }

  await add(1,"CollateralPrimaryFeed","LQCTestnetPriceFeed","lending/LQCTestnetPriceFeed",[governance,8,BigInt(answers[0])]);
  await add(2,"CollateralSecondaryFeed","LQCTestnetPriceFeed","lending/LQCTestnetPriceFeed",[governance,8,BigInt(answers[1])]);
  await add(3,"DebtPrimaryFeed","LQCTestnetPriceFeed","lending/LQCTestnetPriceFeed",[governance,8,BigInt(answers[2])]);
  await add(4,"DebtSecondaryFeed","LQCTestnetPriceFeed","lending/LQCTestnetPriceFeed",[governance,8,BigInt(answers[3])]);
  await add(5,"LQCOracleManager","LQCOracleManager","lending/LQCOracleManager",[governance,guardian]);
  await add(6,"LQCInterestRateModel","LQCInterestRateModel","lending/LQCInterestRateModel",[governance,guardian]);
  await add(7,"LQCLendingMarketRegistry","LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",[governance,guardian,addrs.LQCOracleManager]);
  await add(8,"LQCLendingInterestIndex","LQCLendingInterestIndex","lending/LQCLendingInterestIndex",[governance,addrs.LQCInterestRateModel]);
  await add(9,"LQCLendingCore","LQCLendingCore","lending/LQCLendingCore",[governance,addrs.LQCLendingMarketRegistry,addrs.LQCLendingInterestIndex]);
  await add(10,"LQCLiquidationEngine","LQCLiquidationEngine","lending/LQCLiquidationEngine",[addrs.LQCLendingCore]);

  const oracleI=new ethers.Interface([
    "function configureAsset(address asset,address primary,address secondary,uint32 maxAge,uint16 maxDeviationBps)"
  ]);
  const rateI=new ethers.Interface([
    "function configureRate(bytes32 id,(uint16 baseAprBps,uint16 slope1AprBps,uint16 slope2AprBps,uint16 optimalUtilizationBps,uint16 reserveFactorBps,bool enabled) config)"
  ]);
  const indexI=new ethers.Interface(["function initializeMarket(bytes32 id)","function setCore(address newCore)"]);
  const registryI=new ethers.Interface([
    "function configureMarket((address collateralAsset,address debtAsset,uint8 collateralDecimals,uint8 debtDecimals,uint16 maxLtvBps,uint16 liquidationThresholdBps,uint16 liquidationBonusBps,uint128 supplyCap,uint128 borrowCap,uint128 minBorrow,bool enabled) config)"
  ]);
  const coreI=new ethers.Interface(["function setLiquidationEngine(address newEngine)"]);
  const m=approved.market, marketId=m.marketId;
  const configActions=[
    {order:1,actor:"governanceSafe",target:addrs.LQCOracleManager,action:"configure-collateral-oracle",data:oracleI.encodeFunctionData("configureAsset",[m.collateralAsset,addrs.CollateralPrimaryFeed,addrs.CollateralSecondaryFeed,approved.oracle.maxStalenessSeconds,approved.oracle.maxDeviationBps])},
    {order:2,actor:"governanceSafe",target:addrs.LQCOracleManager,action:"configure-debt-oracle",data:oracleI.encodeFunctionData("configureAsset",[m.debtAsset,addrs.DebtPrimaryFeed,addrs.DebtSecondaryFeed,approved.oracle.maxStalenessSeconds,approved.oracle.maxDeviationBps])},
    {order:3,actor:"governanceSafe",target:addrs.LQCInterestRateModel,action:"configure-rate",data:rateI.encodeFunctionData("configureRate",[marketId,{...approved.rate,enabled:true}])},
    {order:4,actor:"governanceSafe",target:addrs.LQCLendingInterestIndex,action:"initialize-market",data:indexI.encodeFunctionData("initializeMarket",[marketId])},
    {order:5,actor:"governanceSafe",target:addrs.LQCLendingInterestIndex,action:"bind-index-core",data:indexI.encodeFunctionData("setCore",[addrs.LQCLendingCore])},
    {order:6,actor:"governanceSafe",target:addrs.LQCLendingMarketRegistry,action:"configure-market-disabled",data:registryI.encodeFunctionData("configureMarket",[[m.collateralAsset,m.debtAsset,m.collateralDecimals,m.debtDecimals,m.maxLtvBps,m.liquidationThresholdBps,m.liquidationBonusBps,m.supplyCap,m.borrowCap,m.minBorrow,false]])},
    {order:7,actor:"governanceSafe",target:addrs.LQCLendingCore,action:"bind-liquidation-engine",data:coreI.encodeFunctionData("setLiquidationEngine",[addrs.LQCLiquidationEngine])}
  ];

  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_CLEAN_TESTNET_DEPLOYMENT_PACKET",
    status:"REVIEW_REQUIRED",
    network:{name:"BSC Testnet",chainId:97},
    sourceCommit:pin,
    deployer:ethers.getAddress(deployer),
    startingNonce:String(nonce),
    roles:approved.roles,
    market:{...m,enabled:false},
    rate:approved.rate,
    deployments,
    configurationActions:configActions,
    activationAuthorized:false,
    transactionOccurred:false,
    safety:"Unsigned deterministic packet only. No RPC, wallet, key, signature, Safe proposal, deployment, configuration, token movement or transaction."
  };
  return {...body,packetDigest:canonicalDigest(body)};
}

async function main(){
  const [configFile,stage0File,deployer,startingNonce,sourceCommit,outputFile]=process.argv.slice(2);
  if(!configFile||!stage0File||!deployer||startingNonce===undefined||!sourceCommit) throw new Error("Usage: node prepare-master6-clean-lending-deployment.mjs <config.json> <stage0-completion.json> <deployer> <startingNonce> <sourceCommit> [output.json]");
  const read=f=>JSON.parse(fs.readFileSync(path.resolve(f),"utf8"));
  const configDoc=read(configFile);
  const result=await buildMaster6CleanDeploymentPacket({config:configDoc.config||configDoc,stage0Completion:read(stage0File),deployer,startingNonce,sourceCommit});
  const out=JSON.stringify(result,null,2)+"\n";
  if(outputFile) fs.writeFileSync(path.resolve(outputFile),out,{flag:"wx"}); else console.log(out);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main();
