import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const specs={
  Primary:["contracts/futures/LQCAggregatorOracleAdapter.sol","LQCAggregatorOracleAdapter"],
  Twap:["contracts/futures/LQCV3TwapReferenceAdapter.sol","LQCV3TwapReferenceAdapter"]
};
const bundle={schema:"lqc-futures-production-oracle-mobile-artifacts-v1",contracts:{}};
for(const [alias,[source,name]] of Object.entries(specs)){
  const file=path.join(root,"artifacts",source,name+".json");
  if(!fs.existsSync(file))throw new Error("Missing compiled artifact: "+file);
  const a=JSON.parse(fs.readFileSync(file,"utf8"));
  if(a.contractName!==name||a.sourceName!==source||!Array.isArray(a.abi)||!String(a.bytecode).startsWith("0x")||a.bytecode==="0x")throw new Error("Invalid artifact for "+alias);
  bundle.contracts[alias]={contractName:name,sourceName:source,abi:a.abi,bytecode:a.bytecode,deployedBytecode:a.deployedBytecode};
}
const out=path.join(root,"app","futures","futures-production-oracle-mobile-artifacts.json");
fs.writeFileSync(out,JSON.stringify(bundle,null,2)+"\n");
console.log("Wrote "+out);
