import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const forbidden = ["MockLQCFuturesOracle", "contracts/futures/mocks/", "MockERC20", "contracts/mocks/MockERC20.sol"];
// No production Oracle has been approved. Never derive this policy from a manifest
// or environment variable. A future approval requires a separately reviewed change.
const approvedProductionOracles = Object.freeze([]);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value, name) {
  requireCondition(value !== null && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
}
function address(value, name) {
  requireCondition(typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value), `${name} must be a nonzero address`);
  return value.toLowerCase();
}
function integer(value, max, name) {
  requireCondition(Number.isSafeInteger(value) && value > 0 && value <= max, `${name} must be an integer in 1..${max}`);
}

// Pure structural validation. The explicit policy argument supports isolated local
// fixtures; the CLI always uses the empty, repository-controlled production policy.
// Policy records bind chain, role, address, implementation and source identity.
export function validateProductionOracleManifest(manifest, approvedOracles = approvedProductionOracles) {
  object(manifest, "manifest");
  requireCondition(!/mock/i.test(JSON.stringify(manifest)), "Mock Oracle/token configuration is forbidden");
  requireCondition(manifest.schemaVersion === 1, "schemaVersion must be 1");
  requireCondition(manifest.environment === "production", "environment must be production");
  integer(manifest.chainId, Number.MAX_SAFE_INTEGER, "chainId");
  object(manifest.oracle, "oracle");
  const { primary, reference, maxDeviationBps } = manifest.oracle;
  object(primary, "primary");
  object(reference, "reference");
  const primaryAddress = address(primary.address, "primary.address");
  const referenceAddress = address(reference.address, "reference.address");
  requireCondition(primaryAddress !== referenceAddress, "primary/reference addresses must differ");
  requireCondition(primary.implementation === "LQCAggregatorOracleAdapter", "unsupported primary implementation");
  requireCondition(reference.implementation === "LQCV3TwapReferenceAdapter", "unsupported reference implementation");
  for (const [role, feed] of [["primary", primary], ["reference", reference]]) {
    address(feed.sourceAddress, `${role}.sourceAddress`);
    requireCondition(typeof feed.sourceId === "string" && /^[a-z0-9][a-z0-9:._-]*$/.test(feed.sourceId), `${role}.sourceId must be a canonical source identity`);
    integer(feed.heartbeat, 86400, `${role}.heartbeat`);
  }
  requireCondition(primary.heartbeat === reference.heartbeat, "primary/reference heartbeat must match");
  const addresses = [primaryAddress, referenceAddress, primary.sourceAddress.toLowerCase(), reference.sourceAddress.toLowerCase()];
  requireCondition(new Set(addresses).size === addresses.length, "adapter/source addresses must be independent");
  requireCondition(primary.sourceId !== reference.sourceId, "primary/reference source identities must differ");
  integer(maxDeviationBps, 5000, "maxDeviationBps");
  integer(reference.observationWindow, 86400, "reference.observationWindow");
  requireCondition(reference.observationWindow >= 300, "reference.observationWindow must be >= 300");
  requireCondition(typeof reference.minimumLiquidity === "string" && /^[1-9][0-9]*$/.test(reference.minimumLiquidity) && BigInt(reference.minimumLiquidity) < 2n ** 128n, "reference.minimumLiquidity must be a positive uint128 decimal string");
  for (const [role, feed] of [["primary", primary], ["reference", reference]]) {
    requireCondition(approvedOracles.some(entry => entry.chainId === manifest.chainId && entry.role === role && entry.address.toLowerCase() === feed.address.toLowerCase() && entry.implementation === feed.implementation && entry.sourceAddress.toLowerCase() === feed.sourceAddress.toLowerCase() && entry.sourceId === feed.sourceId), `${role} Oracle is unapproved`);
  }
  return true;
}

// Compares declared inputs only; it neither approves Oracles nor proves that a
// deployment consumes these inputs. Both sides must have the manifest schema.
const oracleFields = [
  "chainId", "oracle.primary.address", "oracle.primary.implementation",
  "oracle.primary.sourceAddress", "oracle.primary.sourceId", "oracle.primary.heartbeat",
  "oracle.reference.address", "oracle.reference.implementation",
  "oracle.reference.sourceAddress", "oracle.reference.sourceId", "oracle.reference.heartbeat",
  "oracle.reference.observationWindow", "oracle.reference.minimumLiquidity", "oracle.maxDeviationBps"
];
export function compareOracleConfiguration(manifest, deploymentInput) {
  const read = (value, field) => field.split(".").reduce((v, key) => v?.[key], value);
  for (const field of oracleFields) {
    const expected = read(manifest, field), actual = read(deploymentInput, field);
    requireCondition(expected !== undefined && actual !== undefined, `Oracle configuration missing: ${field}`);
    const normalize = value => field.endsWith(".address") || field.endsWith(".sourceAddress")
      ? (typeof value === "string" ? value.toLowerCase() : value) : value;
    requireCondition(normalize(expected) === normalize(actual), `Oracle configuration mismatch: ${field}`);
  }
  return true;
}

export function runProductionOracleGate(base = root) {
  const candidates = ["scripts/deploy-futures-production.mjs", "config/futures-production.json", "deployments/production/futures.json"].map(file => path.join(base, file)).filter(fs.existsSync);
  requireCondition(candidates.length > 0, "no production Futures deployment/config manifest exists. Production deployment is blocked.");
  for (const file of candidates) {
    const text = fs.readFileSync(file, "utf8");
    for (const marker of forbidden) requireCondition(!text.includes(marker), `test-only marker "${marker}" found in ${path.relative(base, file)}`);
  }
  const manifests = candidates.filter(file => file.endsWith(".json"));
  requireCondition(manifests.length > 0, "production JSON manifest is required; script-only configuration is blocked");
  const configs = manifests.map(file => JSON.parse(fs.readFileSync(file, "utf8")));
  for (const config of configs.slice(1)) compareOracleConfiguration(configs[0], config);
  for (const config of configs) validateProductionOracleManifest(config);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runProductionOracleGate();
    console.log("FUTURES_PRODUCTION_SAFETY_GATE_PASS: production Oracle structure and approval policy validated.");
  } catch (error) {
    console.error(`FUTURES_PRODUCTION_ORACLE_GATE_FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
