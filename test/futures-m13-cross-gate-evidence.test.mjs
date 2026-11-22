import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileM13Bundle} from "../scripts/reconcile-futures-m13-evidence.mjs";
const original=JSON.parse(readFileSync(new URL("./fixtures/futures-m13-unassigned-evidence-bundle.json",import.meta.url),"utf8"));
const copy=()=>structuredClone(original);
const addr=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const H="0x"+"aa".repeat(32);
function assigned(){
 const m=copy();const k=["registry","vault","engine","oracle","collateralToken"];
 k.forEach((name,i)=>{m.m10Manifest.candidate[name]=addr(i+1);
   m.m12Evidence.candidate[name]=addr(i+1)});
 m.m12Evidence.candidate.feed=addr(6);
 m.m10Manifest.source.oracleRuntimeCodehash=H;
 m.m12Evidence.oracle.runtimeCodehash=H;
 m.m12Evidence.authority.registryOwner=addr(7);
 m.m12Evidence.authority.vaultOwner=addr(8);
 m.m12Evidence.authority.oracleOwner=addr(9);
 m.m12Evidence.authority.guardian=addr(10);
 m.m10Manifest.m11={blockNumber:146000000,blockHash:H,marketId:1,
  owners:{registry:addr(7),vault:addr(8),oracle:addr(9)},guardian:addr(10)};
 m.m12Evidence.recovery.marketId=1;
 return m;
}
test("M13 current unassigned candidates BLOCKED without pretending to collect chain data",()=>{
 const r=reconcileM13Bundle(copy());
 assert.equal(r.status,"BLOCKED",JSON.stringify(r.failures));
 assert.equal(r.failures.length,0);
 assert.equal(r.crossGateConsistency,"STRUCTURALLY_RECONCILED");
 assert.equal(r.chainReadOnlyEvidenceAccepted,false);
 assert.equal(r.deploymentAuthorized,false);
});
test("M13 rejects different Oracle address between M10 and M12",()=>{
 const m=assigned();m.m12Evidence.candidate.oracle=addr(33);
 assert.equal(reconcileM13Bundle(m).status,"FAIL");
});
test("M13 rejects different Oracle code hash across M10 and M12",()=>{
 const m=assigned();m.m12Evidence.oracle.runtimeCodehash="0x"+"bb".repeat(32);
 assert.equal(reconcileM13Bundle(m).status,"FAIL");
});
test("M13 rejects claim of RPC snapshot when provider never queried",()=>{
 const m=assigned();
 m.m11Verdict.candidateAddressesVerified=true;
 assert.equal(reconcileM13Bundle(m).status,"FAIL");
});
test("M13 rejects forged PASS or approval flags from M11",()=>{
 const m=assigned();m.m11Verdict.status="PASS";
 assert.equal(reconcileM13Bundle(m).status,"FAIL");
 const n=assigned();n.m11Verdict.deploymentAuthorized=true;
 assert.equal(reconcileM13Bundle(n).status,"FAIL");
});
test("M13 detects mismatch in M11 block/owner and wrong gate status",()=>{
 const m=assigned();
 m.m11Verdict.rpcQueried=true;
 m.m11Verdict.snapshotBlock=146000000;
 m.m11Verdict.snapshotHash="0x"+"cc".repeat(32);
 assert.equal(reconcileM13Bundle(m).status,"FAIL");
 const n=assigned();n.m11Verdict.status="FAIL";
 assert.equal(reconcileM13Bundle(n).status,"FAIL");
});
test("M13 refuses legacy asset copying regardless of other fields",()=>{
 const m=assigned();m.m12Evidence.candidate.copiesLegacyLedger=true;
 assert.equal(reconcileM13Bundle(m).status,"FAIL");
});
