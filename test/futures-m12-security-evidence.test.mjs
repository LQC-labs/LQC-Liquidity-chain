import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyM12SecurityEvidence} from "../scripts/verify-futures-m12-security-evidence.mjs";
const base=JSON.parse(readFileSync(new URL("./fixtures/futures-m12-security-unassigned.json",import.meta.url),"utf8"));
const fresh=()=>structuredClone(base);
const addr=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const H="0x"+"a1".repeat(32);
function complete(){
 const m=fresh();
 ["registry","vault","engine","oracle","feed","collateralToken"].forEach((k,i)=>m.candidate[k]=addr(i+1));
 Object.assign(m.oracle,{providerMode:"PYTH_PRO",runtimeCodehash:H,feedRuntimeCodehash:H,
  feedImplementationCodehash:H,configHash:H,configVersion:1,heartbeatSeconds:120,
  lastVerifiedPriceAgeSeconds:20,proxyProvenance:"VERIFIED_INDEPENDENTLY",
  priceDecimalsReviewed:true,referenceCircuitBreakerReviewed:true});
 Object.assign(m.recovery,{marketId:1,expectedEpoch:7,approvalValidUntil:2000,
  snapshotTimestamp:1900,explicitEpochBoundActivation:true,legacyActiveEntryPointsBlocked:true,
  guardianCannotReactivate:true,emergencyHaltVerified:true});
 Object.assign(m.authority,{registryOwner:addr(7),vaultOwner:addr(8),oracleOwner:addr(9),
 guardian:addr(10),safeAddress:addr(11),safeThreshold:2,safeSignerCount:3,
 safeSignerProvenanceVerified:true,ownerAcceptanceVerified:true,guardianEmergencyOnlyVerified:true});
 Object.assign(m.review,{sourceCommit:H,independentAuditStatus:"APPROVED",
  oracleLicenseCleared:true,epochReplayRegressionPassed:true,withdrawalRightsPreserved:true,
  deploymentApproval:true,rawEvidenceVerifiedIndependently:true});
 return m;
}
test("M12 current candidate remains BLOCKED without invented approvals",()=>{
 const r=verifyM12SecurityEvidence(fresh());
 assert.equal(r.status,"BLOCKED"); assert.equal(r.failures.length,0);
 assert.ok(r.blockers.some(x=>x.includes("candidate unassigned")));
 assert.equal(r.marketActivationAuthorized,false);
});
test("M12 even complete self-reported manifest does not grant operational approval",()=>{
 const r=verifyM12SecurityEvidence(complete());
 assert.equal(r.status,"BLOCKED",r.failures.join(","));
 assert.equal(r.failures.length,0);assert.equal(r.deploymentAuthorized,false);
 assert.equal(r.productionOracleApproved,false);
});
test("M12 refuses historical asset movement, aliases and unsafe old pointer",()=>{
 const m=complete();m.candidate.callsLegacySetEngine=true;
 assert.equal(verifyM12SecurityEvidence(m).status,"FAIL");
 const n=complete();n.candidate.vault="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
 assert.equal(verifyM12SecurityEvidence(n).status,"FAIL");
});
test("M12 rejects stale quotes, heartbeat outside contract bounds and expired recovery",()=>{
 const m=complete();m.oracle.lastVerifiedPriceAgeSeconds=121;
 assert.equal(verifyM12SecurityEvidence(m).status,"FAIL");
 const n=complete();n.oracle.heartbeatSeconds=86401;
 assert.equal(verifyM12SecurityEvidence(n).status,"FAIL");
 const p=complete();p.recovery.approvalValidUntil=1900;
 assert.equal(verifyM12SecurityEvidence(p).status,"FAIL");
});
test("M12 detects unsafe Safe threshold and missing provenance",()=>{
 const m=complete();m.authority.safeThreshold=4;
 assert.equal(verifyM12SecurityEvidence(m).status,"FAIL");
 const n=complete();n.authority.safeSignerProvenanceVerified=false;
 n.oracle.proxyProvenance="UNVERIFIED";
 const r=verifyM12SecurityEvidence(n);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.blockers.some(x=>x.includes("Safe signer")));
 assert.ok(r.blockers.some(x=>x.includes("feed/proxy")));
});
test("M12 missing epoch replay or independent audit blocks",()=>{
 const m=complete();m.review.epochReplayRegressionPassed=false;
 m.review.independentAuditStatus="PENDING";
 const r=verifyM12SecurityEvidence(m);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.blockers.some(x=>x.includes("old-epoch")));
 assert.ok(r.blockers.some(x=>x.includes("independent security audit")));
});
