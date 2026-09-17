import assert from "node:assert/strict";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { verifyIntentStage3FinalState } from "../scripts/verify-intent-stage3-final-state.mjs";

describe("LQC Intent Stage-3 multi-RPC final state", function () {
  const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);
  const governance = a(10), risk = a(11), treasury = a(12), hub = a(20), quote = a(21), registry = a(22), verifier = a(23), solver = a(24), attesters = [a(30), a(31)];
  const iface = new ethers.Interface(["function nonce() view returns(uint256)", "function quoteManager() view returns(address)", "function solverRegistry() view returns(address)", "function internalSolver() view returns(address)", "function pendingInternalSolver() view returns(address)", "function exposureManager() view returns(address)", "function executionVerifier() view returns(address)", "function resolver() view returns(address)", "function slashRecipient() view returns(address)", "function attesterEnabled(address) view returns(bool)", "function paused() view returns(bool)"]);

  function input(change = {}) {
    const planBody = { status: "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL", network: { chainId: 97 }, governanceSafe: governance, endingNonce: "19", transactionOccurred: false };
    const plan = { ...planBody, proposalPlanDigest: canonicalDigest(planBody) };
    const verificationBody = { status: "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, transactionOccurred: true };
    const verification = { ...verificationBody, verificationDigest: canonicalDigest(verificationBody) };
    const manifest = { stage: "stage3-governance-bindings", network: { chainId: 97 }, addresses: { LQCIntentHub: hub, LQCQuoteManager: quote, LQCSolverRegistry: registry, LQCExecutionVerifier: verifier, LQCInternalSolver: solver }, roles: { governanceSafe: governance, riskSafe: risk, treasurySafe: treasury }, policy: { attesterQuorum: 2 }, attesters };
    const provider = disagreement => ({
      getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 500,
      getBlock: async () => ({ hash: disagreement ? ethers.id("other-block") : ethers.id("final-block") }),
      getCode: async () => "0x60016000",
      call: async tx => {
        const fn = iface.getFunction(tx.data.slice(0, 10)).name, target = tx.to.toLowerCase();
        let value;
        if (target === governance.toLowerCase()) value = BigInt(change.safeNonce ?? 20);
        else if (fn === "paused") value = false;
        else if (fn === "attesterEnabled") value = change.disabledAttester ? false : true;
        else {
          const state = {
            [hub.toLowerCase()]: { quoteManager: quote, solverRegistry: registry, internalSolver: solver, pendingInternalSolver: ethers.ZeroAddress },
            [quote.toLowerCase()]: { solverRegistry: registry },
            [registry.toLowerCase()]: { exposureManager: hub, executionVerifier: verifier, resolver: risk, slashRecipient: change.badTreasury ? governance : treasury },
          };
          value = state[target][fn];
        }
        return iface.encodeFunctionResult(fn, [value]);
      },
    });
    return { providers: [provider(false), provider(Boolean(change.rpcDisagreement))], verification, plan, manifest };
  }

  it("verifies the completed bindings at one common block across two RPCs", async function () {
    const result = await verifyIntentStage3FinalState(input());
    assert.equal(result.status, "VERIFIED_STAGE3_GOVERNANCE_BINDINGS");
    assert.equal(result.safeNonce, "20");
    assert.equal(result.rpcCount, 2);
    assert.equal(result.transactionOccurred, true);
  });

  it("rejects wrong nonce, RPC disagreement, disabled attester and wrong Treasury", async function () {
    await assert.rejects(verifyIntentStage3FinalState(input({ safeNonce: 19 })), /nonce/);
    await assert.rejects(verifyIntentStage3FinalState(input({ rpcDisagreement: true })), /RPC disagreement/);
    await assert.rejects(verifyIntentStage3FinalState(input({ disabledAttester: true })), /activation/);
    await assert.rejects(verifyIntentStage3FinalState(input({ badTreasury: true })), /Registry/);
  });
});
