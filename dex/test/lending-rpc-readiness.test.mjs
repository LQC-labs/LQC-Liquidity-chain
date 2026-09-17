import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { classifyRpcFailure, inspectLendingRpcReadiness } from "../scripts/inspect-lending-rpc-readiness.mjs";

const deployer = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB", hash = ethers.id("common-block");
function provider(options = {}) { return { getNetwork: async () => { if (options.error === "rate") throw new Error("429 Too Many Requests"); if (options.error === "timeout") { const error = new Error("request timeout"); error.code = "TIMEOUT"; throw error; } return { chainId: BigInt(options.chainId || 97) }; }, getBlockNumber: async () => options.head || 100, getBlock: async () => ({ hash: options.hash || hash }), getTransactionCount: async () => options.nonce ?? 10, getBalance: async () => options.balance ?? 1000n }; }

describe("Lending RPC readiness diagnostics", function () {
  it("accepts two labelled RPCs only when canonical state agrees", async function () { const result = await inspectLendingRpcReadiness({ providers: [provider(), provider({ head: 101 })], labels: ["provider-a", "provider-b"], deployer }); assert.equal(result.status, "READY_FOR_STAGE0_PREFLIGHT"); assert.equal(result.commonBlock, 100); assert.equal(result.healthyRpcCount, 2); });
  it("reports rate limits and timeouts without leaking endpoint credentials", async function () { const result = await inspectLendingRpcReadiness({ providers: [provider({ error: "rate" }), provider({ error: "timeout" })], labels: ["onfinality", "backup"], deployer }); assert.equal(result.status, "BLOCKED_RPC_READINESS"); assert.deepEqual(result.providers.map(x => x.error), ["RATE_LIMITED", "TIMEOUT"]); assert.doesNotMatch(JSON.stringify(result), /https:|api[-_]?key/i); });
  it("blocks nonce, balance and canonical block disagreement", async function () { for (const second of [provider({ nonce: 11 }), provider({ balance: 999n }), provider({ hash: ethers.id("other") })]) { const result = await inspectLendingRpcReadiness({ providers: [provider(), second], labels: ["a", "b"], deployer }); assert.equal(result.status, "BLOCKED_RPC_READINESS"); assert.equal(result.checks.canonicalStateAgreement, false); } });
  it("rejects duplicate labels and classifies common failures", async function () { await assert.rejects(inspectLendingRpcReadiness({ providers: [provider(), provider()], labels: ["same", "same"], deployer }), /distinctly labelled/); assert.equal(classifyRpcFailure(new Error("429 Too Many Requests")), "RATE_LIMITED"); assert.equal(classifyRpcFailure(new Error("request timeout")), "TIMEOUT"); });
  it("contains no key, signing, wallet or transaction broadcast path", function () { const source = fs.readFileSync(new URL("../scripts/inspect-lending-rpc-readiness.mjs", import.meta.url), "utf8"); assert.doesNotMatch(source, /PRIVATE_KEY|signTransaction|eth_sendTransaction|requestAccounts/); });
});
