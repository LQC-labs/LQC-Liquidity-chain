import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const source="contracts/futures/LQCPythReferenceAdapter.sol";
const name="LQCPythReferenceAdapter";
const artifactPath=path.join(root,"artifacts",source,name+".json");
if(!fs.existsSync(artifactPath)) throw new Error("Missing compiled Pyth adapter artifact.");

const artifact=JSON.parse(fs.readFileSync(artifactPath,"utf8"));
if(artifact.contractName!==name||artifact.sourceName!==source||!String(artifact.bytecode).startsWith("0x")||artifact.bytecode==="0x"){
  throw new Error("Invalid Pyth reference artifact.");
}

const config={
  chainId:97,
  network:"BSC Testnet",
  pythCore:"0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb",
  bnbUsdPriceId:"0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
  maxAgeSeconds:120,
  maxConfidenceBps:500,
  circuitBreakerBps:500,
  activationBlockedUntil:["PYTH_API_KEY configured","fresh Hermes validation PASS","on-chain Pyth update path verified","Governance review"]
};

const packet={
  schema:"lqc-futures-pyth-reference-deployment-packet-v1",
  status:"PREPARED_NOT_APPROVED_FOR_ACTIVATION",
  contract:{contractName:name,sourceName:source,abi:artifact.abi,bytecode:artifact.bytecode,deployedBytecode:artifact.deployedBytecode},
  constructorArgs:[config.pythCore,config.bnbUsdPriceId,config.maxAgeSeconds,config.maxConfidenceBps],
  config,
  safety:{
    walletTransactionRequiredForDeployment:true,
    governanceMutationIncluded:false,
    liveActivationIncluded:false,
    hermesFreshnessGateRequired:true,
    failClosedRequired:true
  }
};

const out=path.join(root,"app","futures","futures-pyth-reference-deployment-packet.json");
fs.writeFileSync(out,JSON.stringify(packet,null,2)+"\n");
console.log("Wrote "+out);
