import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIntentStage4CompletionPackage, writeIntentStage4CompletionPackage } from "../scripts/build-intent-stage4-completion-package.mjs";
import { runIntentStage4AuditGate } from "../scripts/run-intent-stage4-audit-gate.mjs";
import { verifyIntentStage4AuditGate } from "../scripts/verify-intent-stage4-audit-gate.mjs";
import { stage4CompletionFixture } from "./intent-v1-stage4-completion-package.test.mjs";

function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),"lqc-stage4-audit-"));fs.writeFileSync(path.join(root,"package-lock.json"),"{\"lockfileVersion\":3}\n");const inputs=stage4CompletionFixture(),packageDirectory=path.join(root,"completion");writeIntentStage4CompletionPackage(packageDirectory,buildIntentStage4CompletionPackage(inputs),inputs);const gitRevision="ab".repeat(20),auditRecord=runIntentStage4AuditGate({root,packageDirectory,gitStatus:"",gitRevision});return{root,packageDirectory,gitRevision,auditRecord}}
describe("LQC Intent Stage-4 audit gate",function(){
  it("binds the exact completion package to a clean source and lockfile",function(){const input=fixture(),result=input.auditRecord;assert.equal(result.status,"PASS_STAGE4_AUDIT_GATE");assert.equal(result.sourceRevision,input.gitRevision);assert.equal(result.checks.length,7);assert.equal(Object.keys(result.fileDigests).length,14);assert.match(result.auditGateDigest,/^sha256:[0-9a-f]{64}$/)});
  it("independently rebuilds the audit gate",function(){const input=fixture(),result=verifyIntentStage4AuditGate({...input,gitStatus:""});assert.equal(result.status,"VERIFIED_STAGE4_AUDIT_GATE");assert.equal(result.auditGateDigest,input.auditRecord.auditGateDigest);assert.equal(result.transactionOccurred,false);assert.match(result.auditVerificationDigest,/^sha256:[0-9a-f]{64}$/)});
  it("rejects dirty source, revision, lockfile, record and package substitution",function(){let input=fixture();assert.throws(()=>runIntentStage4AuditGate({...input,gitStatus:" M file"}),/dirty worktree/);input=fixture();assert.throws(()=>runIntentStage4AuditGate({...input,gitStatus:"",gitRevision:"short"}),/revision/);input=fixture();fs.writeFileSync(path.join(input.root,"package-lock.json"),"{}\n");assert.throws(()=>verifyIntentStage4AuditGate({...input,gitStatus:""}),/does not match/);input=fixture();input.auditRecord.sourceRevision="cd".repeat(20);assert.throws(()=>verifyIntentStage4AuditGate({...input,gitStatus:""}),/Invalid/);input=fixture();fs.appendFileSync(path.join(input.packageDirectory,"COMPLETION.md"),"changed\n");assert.throws(()=>verifyIntentStage4AuditGate({...input,gitStatus:""}),/summary/)});
  it("contains no network, key, signing or transaction path",function(){for(const file of["../scripts/run-intent-stage4-audit-gate.mjs","../scripts/verify-intent-stage4-audit-gate.mjs"]){const source=fs.readFileSync(new URL(file,import.meta.url),"utf8");assert.doesNotMatch(source,/JsonRpcProvider|fetch\(|PRIVATE_KEY|signTransaction|eth_sendTransaction/)} });
});
