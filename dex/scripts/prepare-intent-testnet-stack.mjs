import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const readJson=relative=>JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,relative),"utf8"));
const artifact=name=>readJson(`../artifacts/contracts/intent-v1/${name}.sol/${name}.json`);
const governance=readJson("../deployments/governance-safe-bsc-testnet-97.json");
const risk=readJson("../deployments/risk-safe-bsc-testnet-97.json");
const guardian=readJson("../deployments/emergency-guardian-safe-bsc-testnet-97.json");
const treasury=readJson("../deployments/treasury-safe-bsc-testnet-97.json");
const routerStack=readJson("../deployments/router2-execution-stack-stage3-bsc-testnet-97.json");

export const INTENT_TESTNET_POLICY=Object.freeze({attesterQuorum:2,maxGasOverrunBps:2000,maxPriceImpactBps:500,maxMarketDeviationBps:300,minimumBond:ethers.parseUnits("10000",18),solverExposureLimit:ethers.parseUnits("1000",18)});
const names=["LQCIntentHub","LQCQuoteManager","LQCSolverRegistry","LQCExecutionVerifier","LQCInternalSolver"];
const interfaces=Object.fromEntries(names.map(name=>[name,new ethers.Interface(artifact(name).abi)]));
const deploy=async(name,args)=>(await new ethers.ContractFactory(artifact(name).abi,artifact(name).bytecode).getDeployTransaction(...args)).data;
const validAddress=value=>ethers.isAddress(value)&&value!==ethers.ZeroAddress;

function assertSafe(record,role,threshold,owners){if(record?.network?.chainId!==97||record.role!==role||!validAddress(record.address)||record.threshold!==threshold||record.owners?.length!==owners)throw new Error(`Invalid ${role} Safe policy`);}
function checkedAddresses(addresses){for(const name of names)if(addresses[name]!==undefined&&!validAddress(addresses[name]))throw new Error(`Invalid ${name} address`);return addresses;}

export async function buildIntentTestnetManifest({bondToken,addresses={},attesters=[]}){
  assertSafe(governance,"governance",4,7);assertSafe(risk,"risk",3,5);assertSafe(guardian,"guardian",3,5);assertSafe(treasury,"treasury",3,5);checkedAddresses(addresses);
  if(!validAddress(bondToken)||!validAddress(routerStack.executions?.executionRouter?.address))throw new Error("Valid Bond token and Router 2.0 execution address are required");
  if(!Array.isArray(attesters)||attesters.some(value=>!validAddress(value))||new Set(attesters.map(value=>value.toLowerCase())).size!==attesters.length||attesters.length>16)throw new Error("Invalid attesters");
  let stage,actions;
  const coreReady=["LQCIntentHub","LQCQuoteManager","LQCSolverRegistry","LQCExecutionVerifier"].every(name=>validAddress(addresses[name]));
  if(!coreReady){stage="stage1-core-deploy";actions=[
    {actor:"deployer",action:"deploy-intent-hub",to:null,data:await deploy("LQCIntentHub",[governance.address,risk.address,guardian.address])},
    {actor:"deployer",action:"deploy-quote-manager",to:null,data:await deploy("LQCQuoteManager",[governance.address,guardian.address])},
    {actor:"deployer",action:"deploy-solver-registry",to:null,data:await deploy("LQCSolverRegistry",[bondToken,governance.address,guardian.address,INTENT_TESTNET_POLICY.minimumBond])},
    {actor:"deployer",action:"deploy-execution-verifier",to:null,data:await deploy("LQCExecutionVerifier",[governance.address,guardian.address,INTENT_TESTNET_POLICY.attesterQuorum,INTENT_TESTNET_POLICY.maxGasOverrunBps,INTENT_TESTNET_POLICY.maxPriceImpactBps,INTENT_TESTNET_POLICY.maxMarketDeviationBps])},
  ];}else if(!validAddress(addresses.LQCInternalSolver)){stage="stage2-solver-deploy";actions=[{actor:"deployer",action:"deploy-internal-solver",to:null,data:await deploy("LQCInternalSolver",[addresses.LQCIntentHub,routerStack.executions.executionRouter.address,governance.address])}];}
  else{if(attesters.length<INTENT_TESTNET_POLICY.attesterQuorum)throw new Error("Attester count is below quorum");stage="stage3-governance-bindings";actions=[
    {actor:"governance-safe",action:"registry-set-exposure-manager",to:addresses.LQCSolverRegistry,data:interfaces.LQCSolverRegistry.encodeFunctionData("setExposureManager",[addresses.LQCIntentHub])},
    {actor:"governance-safe",action:"registry-set-verifier",to:addresses.LQCSolverRegistry,data:interfaces.LQCSolverRegistry.encodeFunctionData("setExecutionVerifier",[addresses.LQCExecutionVerifier])},
    {actor:"governance-safe",action:"registry-set-resolver",to:addresses.LQCSolverRegistry,data:interfaces.LQCSolverRegistry.encodeFunctionData("setResolver",[risk.address])},
    {actor:"governance-safe",action:"registry-set-slash-recipient",to:addresses.LQCSolverRegistry,data:interfaces.LQCSolverRegistry.encodeFunctionData("setSlashRecipient",[treasury.address])},
    {actor:"governance-safe",action:"quote-set-registry",to:addresses.LQCQuoteManager,data:interfaces.LQCQuoteManager.encodeFunctionData("setSolverRegistry",[addresses.LQCSolverRegistry])},
    {actor:"governance-safe",action:"hub-set-quote-manager",to:addresses.LQCIntentHub,data:interfaces.LQCIntentHub.encodeFunctionData("setQuoteManager",[addresses.LQCQuoteManager])},
    {actor:"governance-safe",action:"hub-set-solver-registry",to:addresses.LQCIntentHub,data:interfaces.LQCIntentHub.encodeFunctionData("setSolverRegistry",[addresses.LQCSolverRegistry])},
    {actor:"governance-safe",action:"hub-begin-internal-solver",to:addresses.LQCIntentHub,data:interfaces.LQCIntentHub.encodeFunctionData("setInternalSolver",[addresses.LQCInternalSolver])},
    {actor:"governance-safe",action:"solver-accept-hub-role",to:addresses.LQCInternalSolver,data:interfaces.LQCInternalSolver.encodeFunctionData("acceptHubRole")},
    ...attesters.map((attester,index)=>({actor:"governance-safe",action:`verifier-enable-attester-${index+1}`,to:addresses.LQCExecutionVerifier,data:interfaces.LQCExecutionVerifier.encodeFunctionData("setAttester",[attester,true])})),
  ];}
  return{schemaVersion:1,network:{name:"BSC Testnet",chainId:97},phase:"Intent Solver architecture v1.1",stage,roles:{governanceSafe:governance.address,riskSafe:risk.address,guardianSafe:guardian.address,treasurySafe:treasury.address},dependencies:{bondToken,executionRouter:routerStack.executions.executionRouter.address},policy:Object.fromEntries(Object.entries(INTENT_TESTNET_POLICY).map(([key,value])=>[key,typeof value==="bigint"?value.toString():value])),addresses,attesters,orderedActions:actions.map((action,index)=>({id:index+1,value:"0",...action})),dryRun:validateIntentTestnetManifest({stage,actions,addresses,attesters}),safety:"Preparation only. No transaction, approval, token movement, Solver registration, or deployment is performed."};
}

export function validateIntentTestnetManifest({stage,actions,addresses={},attesters=[]}){if(!["stage1-core-deploy","stage2-solver-deploy","stage3-governance-bindings"].includes(stage)||!Array.isArray(actions)||actions.length===0||actions.some(action=>action.to!==null&&!validAddress(action.to)||!ethers.isHexString(action.data)||action.data.length<10))throw new Error("Invalid Intent deployment actions");if(stage==="stage1-core-deploy"&&(actions.length!==4||actions.some(action=>action.actor!=="deployer"||action.to!==null)))throw new Error("Invalid stage-1 deployment order");if(stage==="stage2-solver-deploy"&&(actions.length!==1||actions[0].to!==null))throw new Error("Invalid stage-2 deployment order");if(stage==="stage3-governance-bindings"&&(Object.keys(addresses).length<5||attesters.length<INTENT_TESTNET_POLICY.attesterQuorum||actions.some(action=>action.actor!=="governance-safe"||!validAddress(action.to))))throw new Error("Invalid stage-3 governance order");return{valid:true,transactionOccurred:false,actionCount:actions.length,stage};}

async function main(){const bondToken=process.env.INTENT_BOND_TOKEN_ADDRESS,attesters=String(process.env.INTENT_ATTESTER_ADDRESSES||"").split(",").map(value=>value.trim()).filter(Boolean),addresses={},variables={LQCIntentHub:"INTENT_HUB_ADDRESS",LQCQuoteManager:"QUOTE_MANAGER_ADDRESS",LQCSolverRegistry:"SOLVER_REGISTRY_ADDRESS",LQCExecutionVerifier:"EXECUTION_VERIFIER_ADDRESS",LQCInternalSolver:"INTERNAL_SOLVER_ADDRESS"};for(const[name,variable]of Object.entries(variables))if(process.env[variable])addresses[name]=process.env[variable];const manifest=await buildIntentTestnetManifest({bondToken,addresses,attesters}),output=path.resolve(import.meta.dirname,`../deployments/intent-stack-${manifest.stage}-bsc-testnet-97.json`);fs.writeFileSync(output,`${JSON.stringify(manifest,null,2)}\n`);console.log(`Wrote ${output}`);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
