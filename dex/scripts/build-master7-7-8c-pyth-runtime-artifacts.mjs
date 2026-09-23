import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const specs={
 PythReference:["contracts/futures/LQCPythReferenceAdapter.sol","LQCPythReferenceAdapter"],
 PythUpdateHelper:["contracts/futures/LQCPythUpdateHelper.sol","LQCPythUpdateHelper"]
};
const out={schema:"lqc-futures-pyth-runtime-artifacts-v1",contracts:{}};
for(const [alias,[source,name]] of Object.entries(specs)){
 const p=path.join(root,"artifacts",source,name+".json");
 const a=JSON.parse(fs.readFileSync(p,"utf8"));
 if(a.contractName!==name||a.sourceName!==source||a.bytecode==="0x")throw new Error("Invalid "+alias);
 out.contracts[alias]={contractName:name,sourceName:source,abi:a.abi,bytecode:a.bytecode,deployedBytecode:a.deployedBytecode};
}
fs.writeFileSync(path.join(root,"app","futures","futures-pyth-runtime-artifacts.json"),JSON.stringify(out,null,2)+"\n");
console.log("Wrote Pyth runtime artifacts");