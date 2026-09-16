import assert from "node:assert/strict";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4Pilot } from "../scripts/prepare-intent-stage4-pilot.mjs";
import { verifyIntentStage4Pilot } from "../scripts/verify-intent-stage4-pilot.mjs";
import { preflightIntentStage4Pilot } from "../scripts/preflight-intent-stage4-pilot.mjs";

const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`), iface = new ethers.Interface(["function sourceEscrow() view returns(address)", "function quoteManager() view returns(address)", "function solverRegistry() view returns(address)", "function internalSolver() view returns(address)", "function paused() view returns(bool)", "function nonceUsed(address,uint256) view returns(bool)", "function balanceOf(address) view returns(uint256)", "function allowance(address,address) view returns(uint256)"]);
function fixture(change = {}) {
  const handoffBody = { status: "VERIFIED_STAGE3_AUDIT_HANDOFF", network: { chainId: 97 }, transactionOccurred: false }, handoffVerification = { ...handoffBody, handoffVerificationDigest: canonicalDigest(handoffBody) };
  const intentHub = a(1), user = a(2), sourceToken = a(3), destinationToken = a(4), escrow = a(5), quote = a(6), registry = a(7), solver = a(8);
  const pilotPlan = prepareIntentStage4Pilot({ handoffVerification, intentHub, user, sourceToken, destinationToken, recipient: user, sourceAmount: "1000", quotedAmountOut: "2000", minimumAmountOut: "1980", maxSourceAmount: "1000", now: "3000000", deadline: "3000600", nonce: "9", salt: ethers.id("pilot-9"), dexId: ethers.id("LQC_FLOW"), routeData: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[sourceToken, destinationToken]]) });
  const pilotVerification = verifyIntentStage4Pilot({ handoffVerification, pilotPlan, expectedPilotPlanDigest: pilotPlan.pilotPlanDigest });
  const provider = disagreement => ({ getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 700, getBlock: async () => ({ hash: disagreement ? ethers.id("different") : ethers.id("pilot-preflight"), timestamp: 3000300 }), getCode: async target => change.noCode === target ? "0x" : "0x60016000", call: async tx => { const fn = iface.getFunction(tx.data.slice(0, 10)).name, target = tx.to.toLowerCase(); let value; if (target === intentHub.toLowerCase()) value = { sourceEscrow: escrow, quoteManager: quote, solverRegistry: registry, internalSolver: solver, paused: Boolean(change.hubPaused), nonceUsed: Boolean(change.nonceUsed) }[fn]; else if ([quote, registry].some(item => item.toLowerCase() === target) && fn === "paused") value = false; else if (target === sourceToken.toLowerCase() && fn === "balanceOf") value = BigInt(change.balance ?? 1000); else if (target === sourceToken.toLowerCase() && fn === "allowance") value = BigInt(change.allowance ?? 0); else throw new Error(`Missing ${target}.${fn}`); return iface.encodeFunctionResult(fn, [value]); } });
  return { providers: [provider(false), provider(Boolean(change.rpcDisagreement))], pilotPlan, pilotVerification, addresses: { sourceToken } };
}

describe("LQC Intent Stage-4 multi-RPC pilot preflight", function () {
  it("requires exact approval before signature when allowance is zero", async function () { const result = await preflightIntentStage4Pilot(fixture()); assert.equal(result.status, "READY_FOR_EXACT_APPROVAL"); assert.equal(result.exactApprovalRequired, true); assert.equal(result.rpcCount, 2); assert.match(result.preflightDigest, /^sha256:[0-9a-f]{64}$/); });
  it("allows signature review only after the exact allowance exists", async function () { const result = await preflightIntentStage4Pilot(fixture({ allowance: 1000 })); assert.equal(result.status, "READY_FOR_INTENT_SIGNATURE"); assert.equal(result.exactApprovalRequired, false); });
  it("rejects reused nonce, pause, balance, allowance, runtime and RPC disagreement", async function () {
    await assert.rejects(preflightIntentStage4Pilot(fixture({ nonceUsed: true })), /nonce/); await assert.rejects(preflightIntentStage4Pilot(fixture({ hubPaused: true })), /paused/); await assert.rejects(preflightIntentStage4Pilot(fixture({ balance: 999 })), /balance/); await assert.rejects(preflightIntentStage4Pilot(fixture({ allowance: 1 })), /allowance/); const noCode = fixture(); noCode.providers[0].getCode = async target => target.toLowerCase() === noCode.addresses.sourceToken.toLowerCase() ? "0x" : "0x6000"; await assert.rejects(preflightIntentStage4Pilot(noCode), /runtime/); await assert.rejects(preflightIntentStage4Pilot(fixture({ rpcDisagreement: true })), /disagreement/);
  });
});
