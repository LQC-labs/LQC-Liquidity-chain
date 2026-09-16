import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";
import { buildIntentStage4CompletionPackage, readIntentStage4CompletionInputs, renderIntentStage4CompletionMarkdown, STAGE4_COMPLETION_FILES } from "./build-intent-stage4-completion-package.mjs";

export function verifyIntentStage4CompletionPackage(packageDirectory) {
  const directory = path.resolve(packageDirectory), actual = fs.readdirSync(directory).sort();
  if (canonicalDigest(actual) !== canonicalDigest(STAGE4_COMPLETION_FILES)) throw new Error("Stage-4 completion package file set mismatch");
  const inputs = readIntentStage4CompletionInputs(directory), rebuilt = buildIntentStage4CompletionPackage(inputs), stored = JSON.parse(fs.readFileSync(path.join(directory,"completion-manifest.json"),"utf8"));
  if (canonicalDigest(stored) !== canonicalDigest(rebuilt) || stored.completionDigest !== rebuilt.completionDigest) throw new Error("Stage-4 completion manifest mismatch");
  if (fs.readFileSync(path.join(directory,"COMPLETION.md"),"utf8") !== renderIntentStage4CompletionMarkdown(rebuilt)) throw new Error("Stage-4 completion summary mismatch");
  const fileDigests = Object.fromEntries(STAGE4_COMPLETION_FILES.map(name => [name, sha256(fs.readFileSync(path.join(directory,name)))]));
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_COMPLETION_PACKAGE_VERIFICATION", status: "VERIFIED_STAGE4_COMPLETION_PACKAGE", network: rebuilt.network, completionDigest: rebuilt.completionDigest, intentHash: rebuilt.intentHash, quoteHash: rebuilt.quoteHash, executionHash: rebuilt.executionHash, fileDigests, transactionOccurred: false, safety: "Offline Stage-4 package verification only. No key, wallet, RPC call, signature, settlement, or transaction is performed." };
  return { ...body, packageVerificationDigest: canonicalDigest(body) };
}
async function main(){const[packageDirectory,outputFile]=process.argv.slice(2);if(!packageDirectory)throw new Error("Usage: node verify-intent-stage4-completion-package.mjs <package-dir> [output.json]");const result=verifyIntentStage4CompletionPackage(packageDirectory);if(outputFile)fs.writeFileSync(path.resolve(outputFile),`${JSON.stringify(result,null,2)}\n`,{flag:"wx"});else console.log(JSON.stringify(result,null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
