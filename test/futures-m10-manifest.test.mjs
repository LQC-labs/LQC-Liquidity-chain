import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyM10Manifest} from "../scripts/verify-futures-m10-manifest.mjs";
const base=JSON.parse(readFileSync(new URL("./fixtures/futures-m10-undesignated-candidate.json",import.meta.url),"utf8"));
const clone=()=>structuredClone(base);
const candidate=(m)=>{
  m.candidate.registry="0x"+"11".repeat(20);
  m.candidate.vault="0x"+"22".repeat(20);
  m.candidate.engine="0x"+"33".repeat(20);
  m.candidate.oracle="0x"+"44".repeat(20);
  m.candidate.collateralToken="0x"+"55".repeat(20);
  m.wiring={vaultEngine:m.candidate.engine,engineRegistry:m.candidate.registry,
    engineVault:m.candidate.vault,marketOracle:m.candidate.oracle};
  for(const key of Object.keys(m.gates))m.gates[key]=true;
  m.source={registryRuntimeCodehash:"0x"+"aa".repeat(32),vaultRuntimeCodehash:"0x"+"bb".repeat(32),
    engineRuntimeCodehash:"0x"+"cc".repeat(32),oracleRuntimeCodehash:"0x"+"dd".repeat(32)};
  return m;
};
test("M10 unknown candidate remains BLOCKED without deployment authorization",()=>{
  const r=verifyM10Manifest(clone());
  assert.equal(r.status,"BLOCKED");assert.equal(r.errors.length,0);
  assert.equal(r.operationalDeploymentAuthorized,false);
  assert.ok(r.blockers.some(s=>s.includes("candidate registry")));
});
test("M10 fully claimed candidate still not authorized by offline manifest alone",()=>{
  const r=verifyM10Manifest(candidate(clone()));
  assert.equal(r.status,"BLOCKED");
  assert.equal(r.errors.length,0);
  assert.equal(r.assetTransferAuthorized,false);
});
test("M10 forbids old Vault reuse or Engine pointer switch",()=>{
  const m=candidate(clone());m.candidate.vault=m.historical.vault;
  assert.equal(verifyM10Manifest(m).status,"FAIL");
  const n=candidate(clone());n.candidate.callsHistoricalSetEngine=true;
  assert.equal(verifyM10Manifest(n).status,"FAIL");
});
test("M10 detects incorrect Engine -> Vault wiring or duplicated new contracts",()=>{
  const m=candidate(clone());m.wiring.engineVault=m.candidate.registry;
  assert.equal(verifyM10Manifest(m).status,"FAIL");
  const n=candidate(clone());n.candidate.vault=n.candidate.engine;
  assert.equal(verifyM10Manifest(n).status,"FAIL");
});
test("M10 refuses changing frozen account balance or authority disposition",()=>{
  const m=candidate(clone());m.snapshot.knownUserAvailableBaseUnits="0";
  assert.equal(verifyM10Manifest(m).status,"FAIL");
  const n=candidate(clone());n.snapshot.userRightsDisposition="TRANSFER_TO_NEW_VAULT";
  assert.equal(verifyM10Manifest(n).status,"FAIL");
});
test("M10 missing multisig or Oracle provenance is explicitly BLOCKED",()=>{
  const m=candidate(clone());m.gates.multisigApprovalDocumented=false;
  m.gates.oracleFeedProvenanceVerified=false;
  const r=verifyM10Manifest(m);
  assert.equal(r.status,"BLOCKED");
  assert.ok(r.blockers.some(s=>s.includes("multisigApprovalDocumented")));
  assert.ok(r.blockers.some(s=>s.includes("oracleFeedProvenanceVerified")));
});
