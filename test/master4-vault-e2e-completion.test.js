import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const required = [
  "dex/test/vault-deposit-boundaries.test.mjs",
  "dex/test/vault-withdraw-boundaries.test.mjs",
  "dex/test/vault-accounting-boundaries.test.mjs",
  "dex/test/vault-cap-risk-boundaries.test.mjs",
  "dex/test/vault-router-risk-integration.test.mjs",
  "test/master4-vault-accounting-invariant.test.js",
  "test/master4-vault-loss-boundary.test.js",
  "test/master4-vault-cap-pause-boundary.test.js",
  "docs/master4/4-8-vault-e2e-completion.md"
];

test("Master 4/8 completion evidence is present and activation remains forbidden", () => {
  for (const path of required) assert.equal(fs.existsSync(path), true, `missing evidence: ${path}`);
  const doc = fs.readFileSync("docs/master4/4-8-vault-e2e-completion.md", "utf8");
  assert.match(doc, /activationAuthorized: false/);
  assert.match(doc, /Deposit boundaries/);
  assert.match(doc, /Router integration isolation/);
  assert.match(doc, /repository-level Stage 4 evidence/);
});
