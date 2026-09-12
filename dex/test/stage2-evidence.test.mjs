import assert from "node:assert/strict";
import { validateStage2Evidence } from "../scripts/validate-stage2-evidence.mjs";

describe("Stage 2 evidence validator", function () {
  it("accepts bounded BSC testnet evidence", function () {
    const result = validateStage2Evidence({
      chainId: 97,
      preflight: { transactionSubmitted: false },
      quote: { amountOutRaw: "1000", minimumOutputRaw: "990" },
      smokeTrade: { minimumOutputSatisfied: true, transactionHash: "0x" + "11".repeat(32), blockHash: "0x" + "22".repeat(32), blockNumber: 100, recipient: "0x0000000000000000000000000000000000000001" }
    });
    assert.deepEqual(result, { valid: true, chainId: 97 });
  });

  it("fails closed for wrong chain, submitted preflight, or unsafe output", function () {
    assert.throws(() => validateStage2Evidence({ chainId: 56 }), /chain 97/);
    assert.throws(() => validateStage2Evidence({ chainId: 97, preflight: { transactionSubmitted: true } }), /no transaction/);
    assert.throws(() => validateStage2Evidence({
      chainId: 97, quote: { amountOutRaw: "100", minimumOutputRaw: "101" }
    }), /minimum output/);
  });

  it("rejects malformed trade identifiers", function () {
    assert.throws(() => validateStage2Evidence({
      chainId: 97,
      smokeTrade: {
        minimumOutputSatisfied: true,
        transactionHash: "0x123",
        blockHash: "0x" + "22".repeat(32),
        blockNumber: 100,
        recipient: "0x0000000000000000000000000000000000000001"
      }
    }), /hashes/);
  });
});
