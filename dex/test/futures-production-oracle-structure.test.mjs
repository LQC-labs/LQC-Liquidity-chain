import assert from "node:assert/strict";
// Default: existing Mocha glob. Explicit dependency-free local verification only:
// FUT08_TEST_RUNNER=node node test/futures-production-oracle-structure.test.mjs
const { it: test } = await import(process.env.FUT08_TEST_RUNNER === "node" ? "node:test" : "mocha");
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateProductionOracleManifest as validate, runProductionOracleGate as run, compareOracleConfiguration as compare } from "../scripts/gate-futures-production-oracle.mjs";

const addr = n => `0x${String(n).padStart(40, "0")}`;
function fixture() {
  return { schemaVersion: 1, environment: "production", chainId: 56, oracle: {
    primary: { address: addr(1), implementation: "LQCAggregatorOracleAdapter", sourceAddress: addr(3), sourceId: "aggregator:bnb-usd", heartbeat: 3600 },
    reference: { address: addr(2), implementation: "LQCV3TwapReferenceAdapter", sourceAddress: addr(4), sourceId: "v3:bnb-usd", heartbeat: 3600, observationWindow: 300, minimumLiquidity: "1" }, maxDeviationBps: 500
  }};
}
const policy = Object.entries(fixture().oracle).filter(([key]) => key !== "maxDeviationBps").map(([role, feed]) => ({ chainId: 56, role, ...feed }));
test("complete approved local fixture passes structural validation", () => assert.equal(validate(fixture(), policy), true));
const cases = {
  "missing oracle": m => delete m.oracle,
  "wrong schema": m => m.schemaVersion = 2,
  "wrong environment": m => m.environment = "testnet",
  "invalid chain": m => m.chainId = "56",
  "missing primary": m => delete m.oracle.primary,
  "missing reference": m => delete m.oracle.reference,
  "zero address": m => m.oracle.primary.address = addr(0),
  "malformed address": m => m.oracle.reference.address = "0x123",
  "case-insensitive shared address": m => { m.oracle.primary.address = `0x${"a".repeat(40)}`; m.oracle.reference.address = `0x${"A".repeat(40)}`; },
  "shared source address": m => m.oracle.reference.sourceAddress = m.oracle.primary.sourceAddress,
  "source equals adapter": m => m.oracle.primary.sourceAddress = m.oracle.reference.address,
  "shared source identity": m => m.oracle.reference.sourceId = m.oracle.primary.sourceId,
  "noncanonical identity": m => m.oracle.reference.sourceId = " Aggregator ",
  "mock implementation": m => m.oracle.primary.implementation = "MockLQCFuturesOracle",
  "unknown implementation": m => m.oracle.reference.implementation = "UnknownOracle",
  "missing freshness": m => delete m.oracle.primary.heartbeat,
  "missing reference freshness": m => delete m.oracle.reference.heartbeat,
  "zero freshness": m => m.oracle.primary.heartbeat = 0,
  "excess freshness": m => m.oracle.reference.heartbeat = 86401,
  "string freshness": m => m.oracle.primary.heartbeat = "3600",
  "missing deviation": m => delete m.oracle.maxDeviationBps,
  "disabled deviation": m => m.oracle.maxDeviationBps = 0,
  "excess deviation": m => m.oracle.maxDeviationBps = 5001,
  "fractional deviation": m => m.oracle.maxDeviationBps = 1.5,
  "missing TWAP window": m => delete m.oracle.reference.observationWindow,
  "short TWAP window": m => m.oracle.reference.observationWindow = 299,
  "zero liquidity": m => m.oracle.reference.minimumLiquidity = "0",
  "overflow liquidity": m => m.oracle.reference.minimumLiquidity = (2n ** 128n).toString(),
  "unapproved address": m => m.oracle.primary.address = addr(9),
  "unapproved source": m => m.oracle.reference.sourceId = "v3:other",
  "self-declared approval": m => m.approved = true,
};
const expectedErrors = [
  "oracle must be an object",
  "schemaVersion must be 1",
  "environment must be production",
  "chainId must be an integer in 1..9007199254740991",
  "primary must be an object",
  "reference must be an object",
  "primary.address must be a nonzero address",
  "reference.address must be a nonzero address",
  "primary/reference addresses must differ",
  "adapter/source addresses must be independent",
  "adapter/source addresses must be independent",
  "primary/reference source identities must differ",
  "reference.sourceId must be a canonical source identity",
  "Mock Oracle/token configuration is forbidden",
  "unsupported reference implementation",
  "primary.heartbeat must be an integer in 1..86400",
  "reference.heartbeat must be an integer in 1..86400",
  "primary.heartbeat must be an integer in 1..86400",
  "reference.heartbeat must be an integer in 1..86400",
  "primary.heartbeat must be an integer in 1..86400",
  "maxDeviationBps must be an integer in 1..5000",
  "maxDeviationBps must be an integer in 1..5000",
  "maxDeviationBps must be an integer in 1..5000",
  "maxDeviationBps must be an integer in 1..5000",
  "reference.observationWindow must be an integer in 1..86400",
  "reference.observationWindow must be >= 300",
  "reference.minimumLiquidity must be a positive uint128 decimal string",
  "reference.minimumLiquidity must be a positive uint128 decimal string",
  "primary Oracle is unapproved",
  "reference Oracle is unapproved",
  "primary Oracle is unapproved"
];
const policyFor = m => ["primary", "reference"].map(role => ({ chainId: m.chainId, role, ...m.oracle[role] }));
let caseIndex = 0;
for (const [name, mutate] of Object.entries(cases)) {
  const message = expectedErrors[caseIndex++];
  test(`rejects ${name}`, () => {
    const m = fixture(); mutate(m);
    // Duplicate checks must reject even if the synthetic policy permits both records.
    const independentPolicy = ["case-insensitive shared address", "shared source address", "source equals adapter", "shared source identity"].includes(name) ? policyFor(m) : policy;
    assert.throws(() => validate(m, name === "self-declared approval" ? undefined : independentPolicy), { message });
  });
}
test("production policy remains closed for an otherwise valid fixture", () => assert.throws(() => validate(fixture()), /unapproved/));
test("CLI file validation fails closed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fut08-"));
  try {
    assert.throws(() => run(dir), /no production/);
    fs.mkdirSync(path.join(dir, "scripts"));
    const script = path.join(dir, "scripts/deploy-futures-production.mjs");
    fs.writeFileSync(script, "// deploy");
    assert.throws(() => run(dir), /JSON manifest/);
    fs.mkdirSync(path.join(dir, "config"));
    const config = path.join(dir, "config/futures-production.json");
    fs.writeFileSync(config, "{");
    assert.throws(() => run(dir), SyntaxError);
    fs.writeFileSync(config, JSON.stringify(fixture()));
    assert.throws(() => run(dir), /unapproved/);
    for (const marker of ["MockLQCFuturesOracle", "contracts/futures/mocks/", "MockERC20", "contracts/mocks/MockERC20.sol"]) {
      fs.writeFileSync(script, `// ${marker}`);
      assert.throws(() => run(dir), /test-only marker/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("rejects distinct valid heartbeat values", () => {
  const m = fixture(); m.oracle.reference.heartbeat = 600;
  assert.throws(() => validate(m, policy), { message: "primary/reference heartbeat must match" });
});
test("equal declared deployment inputs compare without granting approval", () => {
  assert.equal(compare(fixture(), structuredClone(fixture())), true);
  assert.throws(() => validate(fixture()), { message: "primary Oracle is unapproved" });
});
const comparisonFields = ["chainId", ...["primary", "reference"].flatMap(role =>
  ["address", "implementation", "sourceAddress", "sourceId", "heartbeat"].map(key => `oracle.${role}.${key}`)),
  "oracle.reference.observationWindow", "oracle.reference.minimumLiquidity", "oracle.maxDeviationBps"];
for (const field of comparisonFields) {
  test(`rejects deployment mismatch ${field}`, () => {
    const input = fixture(); const keys = field.split(".");
    const parent = keys.slice(0, -1).reduce((v, key) => v[key], input), key = keys.at(-1);
    // Reuse existing fixture values; no production identity or policy is introduced.
    parent[key] = typeof parent[key] === "number" ? parent[key] + 1 : `${parent[key]} `;
    assert.throws(() => compare(fixture(), input), { message: `Oracle configuration mismatch: ${field}` });
  });
  test(`rejects missing deployment field ${field}`, () => {
    const input = fixture(); const keys = field.split(".");
    delete keys.slice(0, -1).reduce((v, key) => v[key], input)[keys.at(-1)];
    assert.throws(() => compare(fixture(), input), { message: `Oracle configuration missing: ${field}` });
  });
}
test("multiple manifests must agree before approval checks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fut08-compare-"));
  try {
    fs.mkdirSync(path.join(dir, "config"), { recursive: true });
    fs.mkdirSync(path.join(dir, "deployments/production"), { recursive: true });
    fs.writeFileSync(path.join(dir, "config/futures-production.json"), JSON.stringify(fixture()));
    const input = fixture(); input.oracle.maxDeviationBps += 1;
    fs.writeFileSync(path.join(dir, "deployments/production/futures.json"), JSON.stringify(input));
    assert.throws(() => run(dir), { message: "Oracle configuration mismatch: oracle.maxDeviationBps" });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
