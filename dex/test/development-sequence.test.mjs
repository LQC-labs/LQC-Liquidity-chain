import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sequence = fs.readFileSync(path.join(root, "docs/DEVELOPMENT_SEQUENCE.md"), "utf8");

describe("LQC safe high-speed development policy", function () {
  it("keeps acceleration subordinate to security and deployment approval", function () {
    assert.match(sequence, /Safe high-speed development mode/);
    assert.match(sequence, /default operating model for all continuing LQC DEX development/);
    assert.match(sequence, /two to four non-conflicting/);
    assert.match(sequence, /smallest relevant test after each change/);
    assert.match(sequence, /complete `npm run gate:stage1` once at the end/);
    assert.match(sequence, /smart-contract, security-boundary, governance, and asset-accounting changes in small isolated commits/);
    assert.match(sequence, /Require explicit user or governance approval before live deployment, token issuance, fund movement, role activation, ownership transfer, liquidity provisioning, or production configuration changes/);
    assert.match(sequence, /Stop the batch immediately when a relevant test, invariant, compilation, coverage threshold, or deployment validation fails/);
    assert.match(sequence, /does not invent or reuse operational addresses/);
    assert.match(sequence, /without weakening the fixed stage order/);
  });
});
