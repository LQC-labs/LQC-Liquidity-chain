import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const forbidden=["MockLQCFuturesOracle","contracts/futures/mocks/"];
const candidates=[
  path.join(root,"scripts","deploy-futures-production.mjs"),
  path.join(root,"config","futures-production.json"),
  path.join(root,"deployments","production","futures.json")
].filter(fs.existsSync);

if(candidates.length===0){
  console.error("FUTURES_PRODUCTION_ORACLE_GATE_FAIL: no production Futures deployment/config manifest exists. Production deployment is blocked.");
  process.exit(1);
}
for(const file of candidates){
  const text=fs.readFileSync(file,"utf8");
  for(const marker of forbidden) if(text.includes(marker)){
    console.error(`FUTURES_PRODUCTION_ORACLE_GATE_FAIL: test-only oracle marker "${marker}" found in ${path.relative(root,file)}`);
    process.exit(1);
  }
}
console.log("FUTURES_PRODUCTION_ORACLE_GATE_PASS: no test-only oracle markers found in production Futures deployment/config files.");
