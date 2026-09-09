import fs from "node:fs";
import path from "node:path";
import { buildAppConfig, assertOverridesMatchDeployment } from "./app-config.mjs";

const root = path.resolve(import.meta.dirname, "..");
const deploymentFile = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
if (!fs.existsSync(deploymentFile)) throw new Error("DEPLOYMENT_FILE must point to a completed BSC testnet deployment record.");
const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
const config = buildAppConfig(deployment);
assertOverridesMatchDeployment(config, process.env);
const output = path.join(root, "app/config.js");
fs.writeFileSync(output, `window.LQC_FLOW_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`);
console.log(`Updated ${output} from ${deploymentFile} (${config.deploymentFingerprint}).`);
