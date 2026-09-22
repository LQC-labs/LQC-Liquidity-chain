import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");

const requiredArtifacts=[
  ["futures/LQCAggregatorOracleAdapter.sol","LQCAggregatorOracleAdapter"],
  ["futures/LQCV3TwapReferenceAdapter.sol","LQCV3TwapReferenceAdapter"],
  ["futures/LQCFuturesMarketRegistry.sol","LQCFuturesMarketRegistry"],
  ["futures/LQCFuturesVault.sol","LQCFuturesVault"],
  ["futures/LQCPerpEngine.sol","LQCPerpEngine"]
];

function artifact(source,name){
  const file=path.join(root,"artifacts","contracts",source,`${name}.json`);
  if(!fs.existsSync(file)) throw new Error(`Missing current-release artifact: ${name}`);
  const a=JSON.parse(fs.readFileSync(file,"utf8"));
  if(!a.bytecode || a.bytecode==="0x" || !a.deployedBytecode || a.deployedBytecode==="0x"){
    throw new Error(`Empty current-release artifact: ${name}`);
  }
  return {name,bytecodeBytes:(a.bytecode.length-2)/2,runtimeBytes:(a.deployedBytecode.length-2)/2};
}

const historicalPreflight=fs.readFileSync(path.join(root,"scripts","preflight-futures-testnet-deploy.mjs"),"utf8");
if(!historicalPreflight.includes("MockLQCFuturesOracle")){
  throw new Error("Historical preflight classification changed; review 7/7 assumptions.");
}

const oracle=fs.readFileSync(path.join(root,"contracts","futures","LQCAggregatorOracleAdapter.sol"),"utf8");
for(const marker of ["referenceFeed","maxDeviationBps","StaleFeedPrice","ExcessivePriceDeviation"]){
  if(!oracle.includes(marker)) throw new Error(`Production Oracle boundary missing: ${marker}`);
}
const twap=fs.readFileSync(path.join(root,"contracts","futures","LQCV3TwapReferenceAdapter.sol"),"utf8");
for(const marker of ["observationWindow","minimumLiquidity","observe(secondsAgos)","_mulDiv"]){
  if(!twap.includes(marker)) throw new Error(`TWAP reference boundary missing: ${marker}`);
}

const artifacts=requiredArtifacts.map(([source,name])=>artifact(source,name));
const report={
  schema:"lqc-master7-7-current-release-readiness-v1",
  status:"READY_FOR_SEPARATELY_AUTHORIZED_TESTNET_DEPLOYMENT",
  chainIdRequired:97,
  transactionOccurred:false,
  deploymentAuthorized:false,
  activationAuthorized:false,
  historicalMockPreflightProductionEquivalent:false,
  productionOraclePath:{
    primary:"LQCAggregatorOracleAdapter",
    independentReference:"LQCV3TwapReferenceAdapter",
    failClosedChecks:["heartbeat","round/timestamp validity","deviation","TWAP pool readiness","minimum liquidity"]
  },
  artifacts
};
fs.writeFileSync(path.join(root,"master7-7-current-release-readiness.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
