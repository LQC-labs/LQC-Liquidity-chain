import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage2ReviewPackage, writeIntentStage2ReviewPackage } from "../scripts/build-intent-stage2-review-package.mjs";

describe("LQC Intent Stage-2 Internal Solver review package", function () {
  const hub = "0x0000000000000000000000000000000000000010", router = "0x0000000000000000000000000000000000000020", governance = "0x0000000000000000000000000000000000000030", bond = "0x0000000000000000000000000000000000000040";
  const fixture = async () => {
    const readinessBody = { schemaVersion: 1, status: "READY_FOR_INTERNAL_SOLVER_DEPLOYMENT_REVIEW", network: { chainId: 97 }, reviewDigest: "sha256:stage1", deploymentVerificationDigest: "sha256:deployment", addresses: { LQCIntentHub: hub }, dependencies: { executionRouter: router }, roles: { governanceSafe: governance }, bondToken: bond, transactionOccurred: false };
    const readiness = { ...readinessBody, readinessDigest: canonicalDigest(readinessBody) };
    const factory = new ethers.ContractFactory(["constructor(address intentHub_,address executionRouter_,address administrator_)"], "0x60006000");
    const tx = await factory.getDeployTransaction(hub, router, governance);
    return { readiness, manifest: { network: { chainId: 97 }, stage: "stage2-solver-deploy", roles: { governanceSafe: governance }, dependencies: { executionRouter: router, bondToken: bond }, addresses: { LQCIntentHub: hub }, orderedActions: [{ id: 1, actor: "deployer", action: "deploy-internal-solver", to: null, value: "0", data: tx.data }], dryRun: { transactionOccurred: false } } };
  };
  it("binds one Internal Solver deployment to verified Stage-1 state", async function () { const inputs = await fixture(), review = buildIntentStage2ReviewPackage(inputs); assert.equal(review.status, "REVIEW_REQUIRED"); assert.equal(review.dependencies.intentHub, hub); assert.match(review.action.initCodeDigest, /^sha256:[0-9a-f]{64}$/); assert.equal(review.transactionOccurred, false); });
  it("rejects tampered readiness and constructor bindings", async function () { let inputs = await fixture(); inputs.readiness.addresses.LQCIntentHub = bond; assert.throws(() => buildIntentStage2ReviewPackage(inputs), /inputs/); inputs = await fixture(); inputs.manifest.dependencies.executionRouter = bond; assert.throws(() => buildIntentStage2ReviewPackage(inputs), /binding/); inputs = await fixture(); inputs.manifest.orderedActions[0].action = "bind-hub"; assert.throws(() => buildIntentStage2ReviewPackage(inputs), /deployment action/); });
  it("writes four immutable review files", async function () { const inputs = await fixture(), review = buildIntentStage2ReviewPackage(inputs), directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-stage2-review-")), result = writeIntentStage2ReviewPackage(directory, review, inputs); assert.equal(result.fileCount, 4); assert.equal(fs.readdirSync(directory).length, 4); assert.throws(() => writeIntentStage2ReviewPackage(directory, review, inputs), /empty output/); });
});
