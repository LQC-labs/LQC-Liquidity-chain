import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const source="contracts/futures/LQCPythUpdateHelper.sol";
const name="LQCPythUpdateHelper";
const artifactPath=path.join(root,"artifacts",source,name+".json");
if(!fs.existsSync(artifactPath)) throw new Error("Missing compiled Pyth update helper artifact.");

const artifact=JSON.parse(fs.readFileSync(artifactPath,"utf8"));
if(artifact.contractName!==name||artifact.sourceName!==source||!Array.isArray(artifact.abi)||!String(artifact.bytecode).startsWith("0x")||artifact.bytecode==="0x"){
  throw new Error("Invalid Pyth update helper artifact.");
}

const config={
  chainId:97,
  network:"BSC Testnet",
  pythCore:"0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb",
  permissionless:true,
  ownerRequired:false,
  governanceAuthority:false,
  activationBlockedUntil:[
    "PYTH_API_KEY configured for Hermes retrieval",
    "fresh Hermes BNB/USD validation PASS",
    "live updatePriceFeeds path verified on BSC Testnet"
  ]
};

const packet={
  schema:"lqc-futures-pyth-update-helper-deployment-packet-v1",
  status:"PREPARED_NOT_APPROVED_FOR_EXECUTION",
  contract:{contractName:name,sourceName:source,abi:artifact.abi,bytecode:artifact.bytecode,deployedBytecode:artifact.deployedBytecode},
  constructorArgs:[config.pythCore],
  config,
  safety:{
    walletTransactionRequiredForDeployment:true,
    governanceMutationIncluded:false,
    oracleReferenceReplacementIncluded:false,
    priceSettingAuthority:false,
    withdrawalAuthority:false
  }
};

const out=path.join(root,"app","futures","futures-pyth-update-helper-deployment-packet.json");
fs.writeFileSync(out,JSON.stringify(packet,null,2)+"\n");
console.log("Wrote "+out);
