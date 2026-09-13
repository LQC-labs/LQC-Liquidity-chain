import fs from "node:fs";
import path from "node:path";
import { buildAppConfig } from "./app-config.mjs";

const root = path.resolve(import.meta.dirname, "..");
const deploymentFile = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
const activeFile = path.join(root, "app/config.js");
const outputDir = path.resolve(process.env.CUTOVER_OUTPUT_DIR || path.join(root, "deployments/router2-cutover"));
if (!fs.existsSync(deploymentFile)) throw new Error("A completed Router 2.0 DEPLOYMENT_FILE is required.");
const config = buildAppConfig(JSON.parse(fs.readFileSync(deploymentFile, "utf8")));
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "next-config.js"), `window.LQC_FLOW_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`);
fs.copyFileSync(activeFile, path.join(outputDir, "rollback-config.js"));
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({ chainId: 97,
  deploymentFingerprint: config.deploymentFingerprint, nextConfig: "next-config.js", rollbackConfig: "rollback-config.js",
  activation: "Copy next-config.js to app/config.js only after validation and monitoring pass.",
  rollback: "Restore rollback-config.js to app/config.js if post-cutover checks fail." }, null, 2) + "\n");
console.log(`Prepared reversible Router 2.0 UI cutover files in ${outputDir}; active config was not changed.`);
