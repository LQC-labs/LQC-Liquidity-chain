import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { commitEvidence, bytecodeBuffer } from "./master7-7-evidence-context.mjs";

const digest=data=>crypto.createHash("sha256").update(data).digest("hex");
function validateContext(report, evidence) {
  assert.equal(report.evidence?.testedCommitSha,evidence.testedCommitSha,"Tested commit mismatch");
  assert.equal(report.evidence?.pullRequestHeadSha,evidence.pullRequestHeadSha,"PR head mismatch");
  assert.equal(report.transactionOccurred,false);
  assert.equal(report.activationAuthorized,false);
}
export function validateReadiness(report, root, evidence) {
  validateContext(report,evidence);
  assert.equal(report.status,"READY_FOR_SEPARATELY_AUTHORIZED_TESTNET_DEPLOYMENT");
  assert.equal(report.verificationScope,"STATIC_READINESS_ONLY");
  assert.equal(report.fullRegressionPassed,false);
  assert.equal(report.deploymentAuthorized,false);
  assert.equal(report.chainIdRequired,97);
  const required=["LQCAggregatorOracleAdapter","LQCV3TwapReferenceAdapter","LQCFuturesMarketRegistry","LQCFuturesVault","LQCPerpEngine"];
  assert.deepEqual(report.artifacts.map(x=>x.name).sort(),required.sort());
  for(const entry of report.artifacts) {
    assert.equal(entry.source,`futures/${entry.name}.sol`);
    const raw=fs.readFileSync(path.join(root,"artifacts/contracts",entry.source,`${entry.name}.json`));
    const artifact=JSON.parse(raw.toString("utf8"));
    const creation=bytecodeBuffer(artifact.bytecode), runtime=bytecodeBuffer(artifact.deployedBytecode);
    assert.equal(entry.artifactFileSha256,digest(raw),"Artifact file hash mismatch");
    assert.equal(entry.creationBytecodeSha256,digest(creation),"Creation bytecode hash mismatch");
    assert.equal(entry.runtimeBytecodeSha256,digest(runtime),"Runtime bytecode hash mismatch");
    assert.equal(entry.bytecodeBytes,creation.length);
    assert.equal(entry.runtimeBytes,runtime.length);
  }
}
export function validateChainReports(wiring,lineage,evidence) {
  for(const report of [wiring,lineage]) {
    validateContext(report,evidence);
    assert.equal(report.chainId,97);
    assert.ok(Number.isSafeInteger(report.observedBlockNumber));
    assert.match(report.observedBlockHash,/^0x[0-9a-f]{64}$/i);
  }
  assert.equal(wiring.status,"VERIFIED_READ_ONLY");
  assert.equal(wiring.deploymentAuthorized,false);
  assert.equal(lineage.status,"RECONCILED_READ_ONLY");
  assert.equal(wiring.observedBlockNumber,lineage.observedBlockNumber,"Observation block mismatch");
  assert.equal(wiring.observedBlockHash,lineage.observedBlockHash,"Observation block hash mismatch");
  assert.equal(wiring.observedBlockTimestamp,lineage.observedBlockTimestamp);
  assert.equal(lineage.productionOracleReady,false);
  assert.equal(lineage.currentReleaseDeploymentVerified,false);
  assert.equal(lineage.verificationScope,"HISTORICAL_DEPLOYMENT_CLASSIFICATION_ONLY");
  assert.equal(lineage.contracts?.Oracle?.testOnly,true);
  for(const label of ["Registry","Vault","Engine"]) {
    assert.equal(wiring.runtime[label].address.toLowerCase(),lineage.contracts[label].address.toLowerCase());
    assert.equal(wiring.runtime[label].codeHash,lineage.contracts[label].onchainCodeHash,"On-chain runtime hash mismatch");
  }
  const allCurrent=Object.values(lineage.contracts).every(x=>x.normalizedRuntimeMatch);
  assert.equal(lineage.currentArtifactLineage,allCurrent
    ? "ALL_RECORDED_RUNTIMES_MATCH_CURRENT_ARTIFACTS"
    : "ONE_OR_MORE_RECORDED_RUNTIMES_DIVERGE_FROM_CURRENT_ARTIFACTS");
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=path.resolve(import.meta.dirname,"..");
  const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));
  const evidence=commitEvidence(root);
  if(process.argv[2]==="readiness") validateReadiness(read("master7-7-current-release-readiness.json"),root,evidence);
  else if(process.argv[2]==="chain") validateChainReports(read("futures-chain97-wiring-report.json"),read("futures-lineage-report.json"),evidence);
  else throw new Error("Expected readiness or chain report validation mode");
  console.log("PASS evidence report contents and scope");
}
