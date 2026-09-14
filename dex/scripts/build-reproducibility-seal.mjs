import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import solc from "solc";

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
const PROOF_FIELDS = ["version", "type", "chainId", "quoteBlock", "expiresAt", "tokenIn", "tokenOut", "amountIn", "slippageBps", "plan", "bestSingle", "improvementBps", "candidates", "proofHash"];
const INTENT_FIELDS = ["version", "type", "chainId", "proofHash", "sender", "target", "calldataHash", "value", "nonce", "deadline", "intentHash"];

const digest = value => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const serialize = value => JSON.stringify(canonical(value));

function validateInput(input) {
  if (!input || typeof input !== "object") throw new Error("Seal input is required.");
  if (!REVISION.test(input.sourceRevision)) throw new Error("sourceRevision must be a lowercase full Git commit SHA.");
  if (!/^v?\d+\.\d+\.\d+/.test(input.nodeVersion)) throw new Error("nodeVersion is invalid.");
  if (!SHA256.test(input.packageLockDigest)) throw new Error("packageLockDigest must be a SHA-256 digest.");
  const compiler = input.compiler ?? {};
  if (!/^0\.8\.30(?:\+|$)/.test(compiler.version) || compiler.optimizer?.enabled !== true || compiler.optimizer?.runs !== 200 || compiler.viaIR !== true || compiler.evmVersion !== "shanghai") {
    throw new Error("Compiler must be Solidity 0.8.30 with optimizer runs 200, viaIR, and Shanghai EVM.");
  }
  if (!Array.isArray(input.sourceFiles) || input.sourceFiles.length === 0) throw new Error("sourceFiles must not be empty.");
  const paths = new Set();
  for (const file of input.sourceFiles) {
    if (!file || typeof file.path !== "string" || file.path.startsWith("/") || file.path.includes("..") || file.path.includes("\\") || !SHA256.test(file.digest)) throw new Error("Each source file needs a safe relative path and SHA-256 digest.");
    if (paths.has(file.path)) throw new Error(`Duplicate source path: ${file.path}`);
    paths.add(file.path);
  }
}

export function buildReproducibilitySeal(input) {
  validateInput(input);
  const sourceFiles = input.sourceFiles.map(file => ({ path: file.path, digest: file.digest })).sort((a, b) => a.path.localeCompare(b.path));
  const body = {
    schemaVersion: 1,
    sealType: "LQC_ROUTER_REPRODUCIBILITY_SEAL",
    sourceRevision: input.sourceRevision,
    runtime: { nodeVersion: input.nodeVersion, packageLockDigest: input.packageLockDigest },
    compiler: { version: input.compiler.version, optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai" },
    schemas: {
      bestExecutionProof: { version: 1, type: "LQC_PROOF_OF_BEST_EXECUTION", requiredFields: PROOF_FIELDS },
      executionIntent: { version: 1, type: "LQC_EXECUTION_INTENT", requiredFields: INTENT_FIELDS }
    },
    sourceFiles,
    sourceTreeDigest: digest(serialize(sourceFiles))
  };
  return { ...body, sealDigest: digest(serialize(body)) };
}

export function verifyReproducibilitySeal(seal) {
  try {
    if (seal?.schemaVersion !== 1 || seal?.sealType !== "LQC_ROUTER_REPRODUCIBILITY_SEAL" || !SHA256.test(seal.sealDigest)) return false;
    const rebuilt = buildReproducibilitySeal({ sourceRevision: seal.sourceRevision, nodeVersion: seal.runtime?.nodeVersion,
      packageLockDigest: seal.runtime?.packageLockDigest, compiler: seal.compiler, sourceFiles: seal.sourceFiles });
    return serialize(rebuilt) === serialize(seal);
  } catch {
    return false;
  }
}

function collectFiles(root) {
  const files = ["app/router-sdk.js", "package.json", "package-lock.json", "scripts/build-reproducibility-seal.mjs", "scripts/compile.mjs", "scripts/quote-api-gateway.mjs"];
  const walk = directory => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith(".sol")) files.push(relative);
    }
  };
  walk("contracts");
  return [...new Set(files)].sort().map(relative => ({ path: relative, digest: digest(fs.readFileSync(path.join(root, relative))) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = path.resolve(import.meta.dirname, "..");
    if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) throw new Error("Refusing to seal a dirty worktree; commit or stash changes first.");
    const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim().toLowerCase();
    const seal = buildReproducibilitySeal({ sourceRevision, nodeVersion: process.version,
      packageLockDigest: digest(fs.readFileSync(path.join(root, "package-lock.json"))),
      compiler: { version: solc.version(), optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai" },
      sourceFiles: collectFiles(root) });
    console.log(`${JSON.stringify(seal, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
