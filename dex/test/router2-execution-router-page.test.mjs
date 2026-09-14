import assert from "node:assert/strict";
import fs from "node:fs";
import { buildExecutionStack } from "../scripts/prepare-router2-execution-stack.mjs";

describe("Router 2.0 Execution Router TokenPocket page", function () {
  const script = fs.readFileSync(new URL("../app/router2-execution-router-testnet.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../app/router2-execution-router-testnet.html", import.meta.url), "utf8");
  const record = JSON.parse(fs.readFileSync(new URL("../deployments/router2-execution-stack-stage2-bsc-testnet-97.json", import.meta.url)));
  it("publishes the exact prepared Execution Router deployment", async function () { const expected = await buildExecutionStack(record.executions.riskRegistry.address); assert.equal(record.orderedActions[1].data, expected.orderedActions[1].data); assert.equal(record.orderedActions[1].data.length, 10518); assert.match(script, /action\.data/); });
  it("requires the recorded successful Risk Registry and both live bindings", function () { assert.equal(record.executions.riskRegistry.status, "success"); assert.match(script, /0x8da5cb5b/); assert.match(script, /0x83444e5f/); assert.match(script, /0x7b103999/); assert.match(script, /0x1c3f5b9e/); });
  it("pins one zero-value deployment and blocks duplicates", function () { assert.match(script, /value: "0x0", data: deployData/); assert.match(script, /if \(await existing\(\)\) return/); assert.match(script, /localStorage\.setItem\(STORAGE_KEY/); assert.match(html, /LQCExecutionRouter 1개 · value 0/); assert.match(html, /토큰 승인·교환·유동성 이동은 없습니다/); });
});
