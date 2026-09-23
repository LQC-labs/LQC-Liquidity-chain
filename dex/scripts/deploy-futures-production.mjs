import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { validateProductionOracleConfig } from "./verify-master7-7-4-production-oracle-config.mjs";

const CHAIN_ID=97n;
const root=path.resolve(import.meta.dirname,"..");
const artifact=(source,name)=>JSON.parse(fs.readFileSync(path.join(root,"artifacts/contracts",source,`${name}.json`)));

export function validateProductionDeploymentAuthorization(env){
  const config=validateProductionOracleConfig(env);
  if(env.FUTURES_EXECUTE_PRODUCTION_DEPLOYMENT!=="I_UNDERSTAND_THIS_SENDS_BSC_TESTNET_TRANSACTIONS") throw new Error("Explicit production-equivalent BSC Testnet deployment authorization is required.");
  if(!env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required at runtime and must never be committed.");
  const signer=new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY);
  if(env.FUTURES_DEPLOYER_ADDRESS && signer.address!==ethers.getAddress(env.FUTURES_DEPLOYER_ADDRESS)) throw new Error("Runtime signer does not match FUTURES_DEPLOYER_ADDRESS.");
  return config;
}
export async function assertProductionDeploymentNetwork(provider){
  if((await provider.getNetwork()).chainId!==CHAIN_ID) throw new Error("Refusing deployment: expected BSC Testnet chain 97.");
  return true;
}
async function checkedDeploy(wallet,provider,a,args,label){
  const factory=new ethers.ContractFactory(a.abi,a.bytecode,wallet);
  const c=await factory.deploy(...args); await c.waitForDeployment();
  const address=await c.getAddress();
  if((await provider.getCode(address))==="0x") throw new Error(`${label} deployment has no runtime bytecode.`);
  return c;
}
export async function deployProductionEquivalentFutures(env,provider=new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)){
  const config=validateProductionDeploymentAuthorization(env);
  await assertProductionDeploymentNetwork(provider);
  const wallet=new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY,provider);
  const reference=await checkedDeploy(wallet,provider,artifact("futures/LQCV3TwapReferenceAdapter.sol","LQCV3TwapReferenceAdapter"),[config.twapPool,config.indexToken,config.quoteToken,config.observationWindow,BigInt(config.minimumLiquidity)],"TWAP reference");
  const oracle=await checkedDeploy(wallet,provider,artifact("futures/LQCAggregatorOracleAdapter.sol","LQCAggregatorOracleAdapter"),[config.owner],"Aggregator Oracle");
  const registry=await checkedDeploy(wallet,provider,artifact("futures/LQCFuturesMarketRegistry.sol","LQCFuturesMarketRegistry"),[config.owner],"Registry");
  const vault=await checkedDeploy(wallet,provider,artifact("futures/LQCFuturesVault.sol","LQCFuturesVault"),[config.owner],"Vault");
  const engine=await checkedDeploy(wallet,provider,artifact("futures/LQCPerpEngine.sol","LQCPerpEngine"),[await registry.getAddress(),await vault.getAddress()],"Engine");
  const oi=new ethers.Interface(["function setFeed(address,address,uint32)","function setCircuitBreaker(address,address,uint16)"]);
  const vi=new ethers.Interface(["function setEngine(address)"]);
  return {status:"DEPLOYED_AWAITING_SEPARATE_GOVERNANCE_CONFIGURATION",chainId:97,deployer:wallet.address,owner:config.owner,contracts:{reference:await reference.getAddress(),oracle:await oracle.getAddress(),registry:await registry.getAddress(),vault:await vault.getAddress(),engine:await engine.getAddress()},ownerActions:[
    {to:await oracle.getAddress(),value:"0",data:oi.encodeFunctionData("setFeed",[config.indexToken,config.primaryFeed,config.heartbeat]),description:"Governance configures the primary production feed."},
    {to:await oracle.getAddress(),value:"0",data:oi.encodeFunctionData("setCircuitBreaker",[config.indexToken,await reference.getAddress(),config.maxDeviationBps]),description:"Governance configures the independent V3 TWAP circuit breaker."},
    {to:await vault.getAddress(),value:"0",data:vi.encodeFunctionData("setEngine",[await engine.getAddress()]),description:"Governance authorizes the Futures engine in the Vault."}
  ],marketActivationAuthorized:false};
}
if(import.meta.url===new URL(`file://${process.argv[1]}`).href) deployProductionEquivalentFutures(process.env).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
