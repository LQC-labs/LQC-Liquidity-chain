import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const root=path.resolve(import.meta.dirname,"..");
const RPC=process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const OWNER="0x89d992f696B40ABbDB6610144faeF336911D8175";

const specs={
  Registry:{
    address:"0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
    tx:"0x3ee3a4f09711d889793b2d9f96071d0ecc4d7c1994b3a8d93f1df9f90b7d3f2d",
    source:"futures/LQCFuturesMarketRegistry.sol",
    name:"LQCFuturesMarketRegistry"
  },
  Vault:{
    address:"0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
    tx:"0x263e7d9135a646caa958e3a317867a13f056e0c712ddd9429d9b432a2d45cda0",
    source:"futures/LQCFuturesVault.sol",
    name:"LQCFuturesVault"
  },
  Oracle:{
    address:"0xbf6a446c5e17228e70e45645ab47f751bdfc4b41",
    tx:"0x902d3e5924f11c54d794a109b20181dcb70242c19a514bca31f07d6808372cd7",
    source:"futures/mocks/MockLQCFuturesOracle.sol",
    name:"MockLQCFuturesOracle",
    testOnly:true
  },
  Engine:{
    address:"0xe4f1320c8709631776c7e39e0916584935882525",
    tx:"0x16a112f0cdfa053e9af81eb56ebfb00ee91dd7538b003addf7069028ab41c870",
    source:"futures/LQCPerpEngine.sol",
    name:"LQCPerpEngine"
  }
};

function artifact(spec){
  return JSON.parse(fs.readFileSync(path.join(root,"artifacts/contracts",spec.source,`${spec.name}.json`),"utf8"));
}

export function normalizeRuntime(code,immutableReferences={}){
  if(!/^0x[0-9a-fA-F]*$/.test(code)) throw new Error("Invalid runtime bytecode");
  const buf=Buffer.from(code.slice(2),"hex");
  for(const refs of Object.values(immutableReferences)){
    for(const {start,length} of refs){
      if(start<0||length<0||start+length>buf.length) throw new Error("Immutable reference outside runtime");
      buf.fill(0,start,start+length);
    }
  }
  return "0x"+buf.toString("hex");
}

export function compareRuntime(onchainCode,a){
  const normalizedOnchain=normalizeRuntime(onchainCode,a.immutableReferences||{});
  const normalizedCurrent=normalizeRuntime(a.deployedBytecode,a.immutableReferences||{});
  return {
    exactLengthMatch:(onchainCode.length===a.deployedBytecode.length),
    immutableReferenceCount:Object.values(a.immutableReferences||{}).flat().length,
    onchainCodeHash:ethers.keccak256(onchainCode),
    currentArtifactCodeHash:ethers.keccak256(a.deployedBytecode),
    normalizedOnchainHash:ethers.keccak256(normalizedOnchain),
    normalizedCurrentHash:ethers.keccak256(normalizedCurrent),
    normalizedRuntimeMatch:normalizedOnchain===normalizedCurrent
  };
}

async function readAddress(provider,to,signature){
  const iface=new ethers.Interface([signature]);
  const data=iface.encodeFunctionData(signature.slice(9,signature.indexOf("(")));
  const raw=await provider.call({to,data});
  return iface.decodeFunctionResult(signature.slice(9,signature.indexOf("(")),raw)[0];
}

async function main(){
  const provider=new ethers.JsonRpcProvider(RPC);
  const network=await provider.getNetwork();
  if(network.chainId!==97n) throw new Error(`Expected BSC Testnet chainId 97, got ${network.chainId}`);

  const contracts={};
  for(const [label,spec] of Object.entries(specs)){
    const receipt=await provider.getTransactionReceipt(spec.tx);
    const tx=await provider.getTransaction(spec.tx);
    if(!receipt||!tx) throw new Error(`${label}: deployment transaction unavailable`);
    if(receipt.status!==1) throw new Error(`${label}: deployment receipt failed`);
    if(!receipt.contractAddress||receipt.contractAddress.toLowerCase()!==spec.address.toLowerCase()){
      throw new Error(`${label}: receipt contractAddress mismatch`);
    }
    if(tx.to!==null) throw new Error(`${label}: recorded deployment tx is not contract creation`);
    if(tx.from.toLowerCase()!==DEPLOYER.toLowerCase()) throw new Error(`${label}: deployer mismatch`);

    const code=await provider.getCode(spec.address);
    if(code==="0x") throw new Error(`${label}: no runtime code at recorded address`);
    const a=artifact(spec);
    const comparison=compareRuntime(code,a);
    contracts[label]={
      address:ethers.getAddress(spec.address),
      deploymentTx:spec.tx,
      deployer:ethers.getAddress(tx.from),
      receiptStatus:receipt.status,
      blockNumber:receipt.blockNumber,
      testOnly:!!spec.testOnly,
      ...comparison,
      lineage:comparison.normalizedRuntimeMatch ? "CURRENT_ARTIFACT_RUNTIME_MATCH" : "HISTORICAL_DEPLOYMENT_DIVERGED_FROM_CURRENT_ARTIFACT"
    };
  }

  const ownerAbi=["function owner() view returns(address)"];
  const vaultAbi=["function owner() view returns(address)","function engine() view returns(address)"];
  const engineAbi=["function registry() view returns(address)","function vault() view returns(address)"];
  const registry=new ethers.Contract(specs.Registry.address,ownerAbi,provider);
  const vault=new ethers.Contract(specs.Vault.address,vaultAbi,provider);
  const engine=new ethers.Contract(specs.Engine.address,engineAbi,provider);

  const wiring={
    registryOwner:await registry.owner(),
    vaultOwner:await vault.owner(),
    vaultEngine:await vault.engine(),
    engineRegistry:await engine.registry(),
    engineVault:await engine.vault()
  };
  if(wiring.registryOwner.toLowerCase()!==OWNER.toLowerCase()) throw new Error("Registry owner mismatch");
  if(wiring.vaultOwner.toLowerCase()!==OWNER.toLowerCase()) throw new Error("Vault owner mismatch");
  if(wiring.vaultEngine.toLowerCase()!==specs.Engine.address.toLowerCase()) throw new Error("Vault engine mismatch");
  if(wiring.engineRegistry.toLowerCase()!==specs.Registry.address.toLowerCase()) throw new Error("Engine registry mismatch");
  if(wiring.engineVault.toLowerCase()!==specs.Vault.address.toLowerCase()) throw new Error("Engine vault mismatch");

  const allCurrent=Object.values(contracts).every(x=>x.normalizedRuntimeMatch);
  const report={
    schema:"lqc-master7-futures-lineage-v1",
    status:"RECONCILED_READ_ONLY",
    chainId:Number(network.chainId),
    currentArtifactLineage:allCurrent ? "ALL_RECORDED_RUNTIMES_MATCH_CURRENT_ARTIFACTS" : "ONE_OR_MORE_RECORDED_RUNTIMES_DIVERGE_FROM_CURRENT_ARTIFACTS",
    activationAuthorized:false,
    transactionOccurred:false,
    productionOracleReady:false,
    notes:[
      "Historical Oracle is the explicitly test-only MockLQCFuturesOracle deployment.",
      "The 7/2 V3 TWAP runtime reference adapter is repository-only and is not claimed deployed.",
      "No missing transaction hash is inferred."
    ],
    contracts,
    wiring
  };

  const outputPath=path.join(root,"futures-lineage-report.json");
  fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  main().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
}
