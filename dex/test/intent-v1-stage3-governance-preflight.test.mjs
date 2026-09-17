import assert from "node:assert/strict";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3Readiness } from "../scripts/build-intent-stage3-readiness.mjs";
import { buildIntentStage3ReviewPackage } from "../scripts/build-intent-stage3-review-package.mjs";
import { preflightIntentStage3AcrossRpcs } from "../scripts/preflight-intent-stage3-governance.mjs";
import { buildIntentTestnetManifest } from "../scripts/prepare-intent-testnet-stack.mjs";

describe("LQC Intent Stage-3 Governance Safe preflight", function () {
  const a = n => ethers.getAddress(`0x${n.toString(16).padStart(40, "0")}`), governance = a(10), risk = a(11), guardian = a(12), treasury = a(13), bond = a(14), router = a(15), hub = a(20), quote = a(21), registry = a(22), verifier = a(23), solver = a(24), escrow = a(25), attesters = [a(30), a(31)], owners = Array.from({ length: 7 }, (_, i) => a(100 + i));
  const addresses = { LQCIntentHub: hub, LQCQuoteManager: quote, LQCSolverRegistry: registry, LQCExecutionVerifier: verifier, LQCInternalSolver: solver };
  const view = new ethers.Interface(["function owner() view returns(address)", "function settler() view returns(address)", "function guardian() view returns(address)", "function sourceEscrow() view returns(address)", "function controller() view returns(address)", "function quoteManager() view returns(address)", "function solverRegistry() view returns(address)", "function internalSolver() view returns(address)", "function pendingInternalSolver() view returns(address)", "function exposureManager() view returns(address)", "function executionVerifier() view returns(address)", "function resolver() view returns(address)", "function slashRecipient() view returns(address)", "function bondToken() view returns(address)", "function minimumBond() view returns(uint256)", "function challengeBond() view returns(uint256)", "function quorum() view returns(uint256)", "function maxGasOverrunBps() view returns(uint256)", "function maxPriceImpactBps() view returns(uint256)", "function maxMarketDeviationBps() view returns(uint256)", "function paused() view returns(bool)", "function attesterEnabled(address) view returns(bool)", "function intentHub() view returns(address)", "function executionRouter() view returns(address)", "function administrator() view returns(address)"]);
  const safe = new ethers.Interface(["function nonce() view returns(uint256)", "function getThreshold() view returns(uint256)", "function getOwners() view returns(address[])"]);

  async function fixture(change = {}) {
    const manifest = await buildIntentTestnetManifest({ bondToken: bond, addresses, attesters });
    const { governanceSafe, riskSafe, guardianSafe } = manifest.roles;
    const deploymentBody = { status: "VERIFIED_STAGE2_INTERNAL_SOLVER_DEPLOYMENT", network: { chainId: 97 }, transactionOccurred: true, deployment: { contractAddress: solver, intentHub: hub, executionRouter: manifest.dependencies.executionRouter, administrator: governanceSafe } };
    const deployment = { ...deploymentBody, verificationDigest: canonicalDigest(deploymentBody) };
    const provider = () => ({
      getNetwork: async () => ({ chainId: BigInt(change.chainId || 97) }), getBlockNumber: async () => 700,
      getBlock: async () => ({ hash: change.blockHash || ethers.id("stage3") }), getCode: async target => change.noSafeCode && target.toLowerCase() === governanceSafe.toLowerCase() ? "0x" : "0x60016000",
      call: async tx => {
        if (tx.to.toLowerCase() === governanceSafe.toLowerCase()) { const fn = safe.getFunction(tx.data.slice(0, 10)).name, values = { nonce: BigInt(change.nonce || 9), getThreshold: BigInt(change.threshold || 4), getOwners: change.owners || owners }; return safe.encodeFunctionResult(fn, [values[fn]]); }
        const fn = view.getFunction(tx.data.slice(0, 10)).name, target = tx.to.toLowerCase(), zero = ethers.ZeroAddress;
        const state = { [hub.toLowerCase()]: { owner: governanceSafe, settler: riskSafe, guardian: guardianSafe, sourceEscrow: escrow, quoteManager: zero, solverRegistry: zero, internalSolver: zero, pendingInternalSolver: zero, paused: false }, [quote.toLowerCase()]: { owner: governanceSafe, guardian: guardianSafe, solverRegistry: zero, paused: false }, [registry.toLowerCase()]: { owner: governanceSafe, guardian: guardianSafe, bondToken: bond, minimumBond: BigInt(manifest.policy.minimumBond), challengeBond: BigInt(manifest.policy.minimumBond) / 100n, resolver: governanceSafe, slashRecipient: governanceSafe, exposureManager: zero, executionVerifier: zero, paused: false }, [verifier.toLowerCase()]: { owner: governanceSafe, guardian: guardianSafe, quorum: 2n, maxGasOverrunBps: 2000n, maxPriceImpactBps: 500n, maxMarketDeviationBps: 300n, paused: false, attesterEnabled: false }, [solver.toLowerCase()]: { intentHub: hub, executionRouter: manifest.dependencies.executionRouter, administrator: governanceSafe }, [escrow.toLowerCase()]: { controller: hub } };
        return view.encodeFunctionResult(fn, [state[target][fn]]);
      },
    });
    const providers = [provider(), provider()], readiness = await buildIntentStage3Readiness({ providers, deployment, manifest }), review = buildIntentStage3ReviewPackage({ readiness, manifest });
    return { providers, deployment, manifest, review, governanceSafe };
  }

  it("revalidates pristine bindings and the exact 4-of-7 Safe without a transaction", async function () { const input = await fixture(), result = await preflightIntentStage3AcrossRpcs(input); assert.equal(result.status, "PREFLIGHT_VERIFIED_FOR_4_OF_7_REVIEW"); assert.equal(result.safeNonce, "9"); assert.equal(result.actionCount, 11); assert.equal(result.actionCalldataDigests.length, 11); assert.equal(result.transactionOccurred, false); });
  it("rejects stale review evidence and a weakened Safe policy", async function () { let input = await fixture(); input.review.actions[0].calldataDigest = ethers.id("tampered"); await assert.rejects(preflightIntentStage3AcrossRpcs(input), /review package/); input = await fixture({ threshold: 3 }); await assert.rejects(preflightIntentStage3AcrossRpcs(input), /4-of-7/); });
  it("rejects missing Safe runtime and RPC disagreement", async function () { let input = await fixture({ noSafeCode: true }); await assert.rejects(preflightIntentStage3AcrossRpcs(input), /runtime/); input = await fixture(); const original = input.providers[1].call; input.providers[1].call = async tx => { if (tx.to.toLowerCase() === input.governanceSafe.toLowerCase()) { const fn = safe.getFunction(tx.data.slice(0, 10)).name, values = { nonce: 10n, getThreshold: 4n, getOwners: owners }; return safe.encodeFunctionResult(fn, [values[fn]]); } return original(tx); }; await assert.rejects(preflightIntentStage3AcrossRpcs(input), /disagreement/); });
});
