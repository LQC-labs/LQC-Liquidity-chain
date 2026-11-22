// 76-17-⑥-⑤ / M08 — offline coverage proof verifier.
// NO network calls, wallet access, transaction submission, or migration authorization.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RE = { hash: /^0x[0-9a-f]{64}$/i, addr: /^0x[0-9a-f]{40}$/i };
const EXPECTED = Object.freeze({
  chainId: 97,
  engine: "0xe4f1320c8709631776c7e39e0916584935882525",
  vault: "0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
  // Frozen deployment evidence is distinct for each contract. Do not guess the Vault deployment block.
});
const allowed = Object.freeze({
  engine: new Set(["PositionOpened", "PositionClosed", "PositionLiquidated"]),
  vault: new Set(["Deposit", "Withdrawal", "CollateralLocked", "CollateralUnlocked"])
});
function integer(v, field) {
  if (!Number.isSafeInteger(v) || v < 0) throw Error(field + " must be nonnegative safe integer");
  return v;
}
function string(v, field) {
  if (typeof v !== "string" || !v.trim()) throw Error(field + " missing");
  return v.trim();
}
function format(v, pattern, field) {
  if (typeof v !== "string" || !pattern.test(v)) throw Error(field + " malformed");
  return v.toLowerCase();
}
function requireArray(v, field) {
  if (!Array.isArray(v)) throw Error(field + " must be array");
  return v;
}
export function verifyM08Coverage(input) {
  const out={status:"BLOCKED",scope:"M08_OFFLINE_LOG_COVERAGE",errors:[],gaps:[],
    warnings:[],inventoryComplete:false,operationalCutoverAuthorized:false};
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("root invalid");
    if (input.schema !== "lqc-m08-coverage-v1") throw Error("schema mismatch");
    if (input.chainId !== EXPECTED.chainId) throw Error("chainId mismatch");
    const snapshot=integer(input.snapshotBlock,"snapshotBlock");
    const snapshotHash=format(input.snapshotHash,RE.hash,"snapshotHash");
    const coverages=requireArray(input.coverages,"coverages");
    if (coverages.length !== 2) throw Error("exactly two contract coverage records required");
    const byContract=new Map();
    for(const record of coverages){
      const name=string(record.contract,"contract");
      if(!Object.hasOwn(EXPECTED,name)|| name === "chainId") throw Error("unsupported contract "+name);
      if(byContract.has(name)) throw Error("duplicate contract coverage "+name);
      if(format(record.address,RE.addr,"contract address")!==EXPECTED[name]) throw Error(name+" address mismatch");
      if(record.snapshotBlock!==snapshot || format(record.snapshotHash,RE.hash,"coverage snapshot hash")!==snapshotHash) {
        throw Error(name+" snapshot mismatch");
      }
      const deployed=integer(record.deploymentBlock,name+" deploymentBlock");
      if(deployed>snapshot) throw Error(name+" deployment after snapshot");
      let next=deployed;
      const ranges=requireArray(record.ranges,name+" ranges");
      if(!ranges.length) out.gaps.push({contract:name,from:deployed,to:snapshot,reason:"no ranges"});
      for(const [i,range] of [...ranges].entries()){
        const from=integer(range.from,name+" from");
        const to=integer(range.to,name+" to");
        if(from>to || to>snapshot) throw Error(name+" range "+i+" invalid");
        if(from<next) throw Error(name+" overlapping or unsorted range "+i);
        if(from>next) out.gaps.push({contract:name,from:next,to:from-1,reason:"unscanned"});
        if(range.completed!==true || range.truncated===true || range.rpcError) {
          out.gaps.push({contract:name,from,to,reason:"failed/incomplete query"});
        }
        string(range.source,name+" source");
        // Do not trust '0 logs' unless a successful, nontruncated response is recorded.
        integer(range.logCount,name+" logCount");
        next=to+1;
      }
      if(next<=snapshot) out.gaps.push({contract:name,from:next,to:snapshot,reason:"unscanned"});
      byContract.set(name, {start:deployed,ranges:ranges.length});
    }
    if(!byContract.has("engine")||!byContract.has("vault")) throw Error("engine and vault required");
    const events=requireArray(input.events,"events");
    const unique=new Set();
    const accounts=new Set();
    for(const [index,e] of events.entries()){
      const name=string(e.contract,"event contract");
      if(!byContract.has(name)) throw Error("unknown event contract "+name);
      if(!allowed[name].has(e.eventName)) throw Error("unknown "+name+" event type");
      const block=integer(e.blockNumber,"event blockNumber");
      if(block<byContract.get(name).start || block>snapshot) throw Error("event outside deployment/snapshot");
      const tx=format(e.transactionHash,RE.hash,"transactionHash");
      const logIndex=integer(e.logIndex,"logIndex");
      const key=tx+":"+logIndex;
      if(unique.has(key)) throw Error("duplicate transactionHash/logIndex at event "+index);
      unique.add(key);
      const account=format(e.account,RE.addr,"account");
      accounts.add(account);
      if(name==="engine") integer(e.marketId,"marketId");
    }
    out.discoveredAccounts=[...accounts].sort();
    out.discoveredEventCount=events.length;
    out.rangeCount=[...byContract.values()].reduce((a,v)=>a+v.ranges,0);
    if(out.gaps.length) {
      out.status="BLOCKED";
      out.warnings.push("Missing or incomplete log coverage; zero events cannot prove zero positions.");
    } else {
      // Do not declare inventory complete: all response attestations are supplied, not independently proven.
      out.status="COVERAGE_FORMAT_PASS";
      out.warnings.push("Range continuity only. Indexed-provider completeness, source authenticity and all accounts still require independent attestation.");
    }
    if(input.independentProvenanceVerified!==true) {
      out.warnings.push("Independent source/receipts provenance not verified.");
    }
  } catch(e) {
    out.status="FAIL";
    out.errors.push(String(e?.message||e));
  }
  return out;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.length!==3){
    console.error("Usage: node scripts/verify-futures-m08-log-coverage.mjs INPUT.json");
    process.exitCode=2;
  } else try{
    const r=verifyM08Coverage(JSON.parse(readFileSync(process.argv[2],"utf8")));
    console.log(JSON.stringify(r,null,2));
    if(r.status!=="COVERAGE_FORMAT_PASS") process.exitCode=1;
  }catch(e){console.error(String(e.message)); process.exitCode=2;}
}
