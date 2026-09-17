import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";
import { verifyIntentStage3CompletionPackage } from "./verify-intent-stage3-completion-package.mjs";

function cleanRevision(value) {
  const revision = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("Invalid Git source revision");
  return revision;
}

export function runIntentStage3AuditGate({ root, packageDirectory, gitStatus, gitRevision }) {
  const worktree = gitStatus ?? execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (String(worktree).trim()) throw new Error("Refusing Stage-3 audit gate on a dirty worktree");
  const sourceRevision = cleanRevision(gitRevision ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }));
  const packageLockDigest = sha256(fs.readFileSync(path.join(root, "package-lock.json")));
  const packageVerification = verifyIntentStage3CompletionPackage(packageDirectory);
  const body = {
    schemaVersion: 1,
    recordType: "LQC_INTENT_STAGE3_AUDIT_GATE",
    status: "PASS_STAGE3_AUDIT_GATE",
    network: { name: "BSC Testnet", chainId: 97 },
    sourceRevision,
    packageLockDigest,
    completionDigest: packageVerification.completionDigest,
    packageVerificationDigest: packageVerification.packageVerificationDigest,
    fileDigests: packageVerification.fileDigests,
    checks: ["clean-git-worktree", "pinned-source-revision", "package-lock-digest", "exact-five-file-set", "source-evidence-digests", "rebuilt-completion-manifest", "exact-completion-summary"],
    transactionOccurred: false,
    safety: "Local audit gate only. No RPC call, wallet, signature, Safe approval, deployment, token movement, or transaction.",
  };
  return { ...body, auditGateDigest: canonicalDigest(body) };
}

async function main() {
  const [packageDirectory, outputFile] = process.argv.slice(2);
  if (!packageDirectory) throw new Error("Usage: node run-intent-stage3-audit-gate.mjs <completion-package-dir> [output.json]");
  const root = path.resolve(import.meta.dirname, "..");
  const result = runIntentStage3AuditGate({ root, packageDirectory: path.resolve(packageDirectory) });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
