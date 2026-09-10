import fs from "node:fs";
import path from "node:path";
import { verifyOperationalRoleActivation } from "./prepare-operational-role-activation.mjs";

const [bundlePath, deploymentPath] = process.argv.slice(2);
if (!bundlePath || !deploymentPath) {
  throw new Error("Pass the activation bundle path and reviewed deployment JSON path.");
}

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const result = verifyOperationalRoleActivation(readJson(bundlePath), readJson(deploymentPath));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
