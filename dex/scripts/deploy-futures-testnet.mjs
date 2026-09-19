import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { validateFuturesPreflightConfig, assertFuturesBudget } from "./preflight-futures-testnet-deploy.mjs";

const CHAIN_ID=97n;
const root=path.resolve(import.meta.dirname,"..");
const artifact=(source,name)=>JSON.parse(fs.readFileSync(path.join(root,"artifacts/contracts",source,`${name}.json`)));

export function validateDeploymentAuthorization(env){
  const c=validateFuturesPreflightConfig(env);
  if(env.FUTURES_EXECUTE_DEPLOYMENT!=="I_UNDERSTAND_THIS_SENDS_TESTNET_TRANSACTIONS") throw new Error("Explicit Futures testnet deployment authorization is required.");
  if(!env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required at runtime and must never be committed.");
  const wallet=new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY);
  if(wallet.address!==c.deployer) throw new Error("Runtime signer does not match FUTURES_DEPLOYER_ADDRESS.");
  return c;
}
export function buildOwnerConfiguration(vaultAddress,engineAddress){
  const iface=new ethers.Interface(["function setEngine(address newEngine)"]);
  return {to:vaultAddress,value:"0",data:iface.encodeFunctionData("setEngine",[engineAddress]),description:"Governance owner must authorize LQCFuturesVault.setEngine(engine)."};
}
async function checkedDeploy(wallet,provider,a,args,label){
  const f=new ethers.ContractFactory(a.abi,a.bytecode,wallet);
  const c=await f.deploy(...args); await c.waitForDeployment();
  const address=await c.getAddress();
  if((await provider.getCode(address))==="0x") throw new Error(`${label} deployment has no runtime bytecode.`);
  return c;
}
export async function deployFuturesTestnet(env,provider=new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)){
  const config=validateDeploymentAuthorization(env);
  if((await provider.getNetwork()).chainId!==CHAIN_ID) throw new Error("Refusing deployment: expected BSC Testnet chain 97.");
  const wallet=new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY,provider);
  const before=await provider.getBalance(wallet.address);
  assertFuturesBudget(before,ethers.parseEther("0.01"),config);
  const registry=await checkedDeploy(wallet,provider,artifact("futures/LQCFuturesMarketRegistry.sol","LQCFuturesMarketRegistry"),[config.owner],"registry");
  const vault=await checkedDeploy(wallet,provider,artifact("futures/LQCFuturesVault.sol","LQCFuturesVault"),[config.owner],"vault");
  const oracle=await checkedDeploy(wallet,provider,artifact("futures/mocks/MockLQCFuturesOracle.sol","MockLQCFuturesOracle"),[],"oracle");
  const engine=await checkedDeploy(wallet,provider,artifact("futures/LQCPerpEngine.sol","LQCPerpEngine"),[await registry.getAddress(),await vault.getAddress()],"engine");
  const after=await provider.getBalance(wallet.address);
  if(after<config.reserve) throw new Error("Post-deployment balance violated protected reserve.");
  if(await registry.owner()!==config.owner || await vault.owner()!==config.owner) throw new Error("Governance owner verification failed.");
  const vaultAddress=await vault.getAddress(), engineAddress=await engine.getAddress();
  if(await vault.engine()!==ethers.ZeroAddress) throw new Error("Unexpected Vault engine state before governance authorization.");
  return {status:"DEPLOYED_AWAITING_GOVERNANCE_CONFIGURATION",chainId:97,deployer:wallet.address,owner:config.owner,balanceBeforeTbnb:ethers.formatEther(before),balanceAfterTbnb:ethers.formatEther(after),contracts:{registry:await registry.getAddress(),vault:vaultAddress,oracle:await oracle.getAddress(),engine:engineAddress},ownerAction:buildOwnerConfiguration(vaultAddress,engineAddress)};
}
async function main(){const r=await deployFuturesTestnet(process.env); console.log(JSON.stringify(r,null,2));}
if(import.meta.url===new URL(`file://${process.argv[1]}`).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
