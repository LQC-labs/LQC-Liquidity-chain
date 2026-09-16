import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";
import { buildIntentStage3CompletionPackage, renderIntentStage3CompletionMarkdown } from "./build-intent-stage3-completion-package.mjs";

const REQUIRED_FILES = ["COMPLETION.md", "completion-manifest.json", "execution-verification.json", "final-state-verification.json", "safe-proposal-plan.json"];

export function verifyIntentStage3CompletionPackage(packageDirectory) {
  const directory = path.resolve(packageDirectory);
  const actualFiles = fs.readdirSync(directory).sort();
  if (canonicalDigest(actualFiles) !== canonicalDigest(REQUIRED_FILES)) throw new Error("Stage-3 completion package file set mismatch");
  const readJson = name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  const inputs = {
    plan: readJson("safe-proposal-plan.json"),
    verification: readJson("execution-verification.json"),
    finalState: readJson("final-state-verification.json"),
  };
  const stored = readJson("completion-manifest.json");
  const rebuilt = buildIntentStage3CompletionPackage(inputs);
  if (canonicalDigest(stored) !== canonicalDigest(rebuilt) || stored.completionDigest !== rebuilt.completionDigest) throw new Error("Stage-3 completion manifest mismatch");
  const markdown = fs.readFileSync(path.join(directory, "COMPLETION.md"), "utf8");
  if (markdown !== renderIntentStage3CompletionMarkdown(rebuilt)) throw new Error("Stage-3 completion summary mismatch");
  const fileDigests = Object.fromEntries(REQUIRED_FILES.map(name => [name, sha256(fs.readFileSync(path.join(directory, name)))]));
  const body = {
    schemaVersion: 1,
    recordType: "LQC_INTENT_STAGE3_COMPLETION_PACKAGE_VERIFICATION",
    status: "VERIFIED_STAGE3_COMPLETION_PACKAGE",
    network: rebuilt.network,
    completionDigest: rebuilt.completionDigest,
    proposalPlanDigest: rebuilt.proposalPlanDigest,
    executionVerificationDigest: rebuilt.executionVerificationDigest,
    finalStateDigest: rebuilt.finalStateDigest,
    fileDigests,
    transactionOccurred: false,
    safety: "Offline package verification only. No signature, approval, RPC call, or transaction is performed.",
  };
  return { ...body, packageVerificationDigest: canonicalDigest(body) };
}

async function main() {
  const [packageDirectory, outputFile] = process.argv.slice(2);
  if (!packageDirectory) throw new Error("Usage: node verify-intent-stage3-completion-package.mjs <package-dir> [output.json]");
  const result = verifyIntentStage3CompletionPackage(packageDirectory);
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
