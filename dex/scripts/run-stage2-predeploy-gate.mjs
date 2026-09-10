import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export const STAGE2_PREDEPLOY_CHECKS = Object.freeze([
  Object.freeze({ label: "Stage 1 repository exit gate", args: Object.freeze(["run", "gate:stage1"]) }),
  Object.freeze({ label: "Production dependency audit", args: Object.freeze(["audit", "--omit=dev", "--audit-level=high"]) }),
  Object.freeze({ label: "BSC testnet live preflight", args: Object.freeze(["run", "preflight:testnet"]) }),
]);

export function runStage2PredeployGate({ spawn = spawnSync, env = process.env } = {}) {
  for (const check of STAGE2_PREDEPLOY_CHECKS) {
    process.stdout.write(`\n[Stage 2 predeploy] ${check.label}\n`);
    const result = spawn(npm, [...check.args], { stdio: "inherit", env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stderr.write(`\nStage 2 predeployment gate failed: ${check.label}\n`);
      return result.status ?? 1;
    }
  }
  process.stdout.write(
    "\nStage 2 predeployment gate passed. This authorizes only the reviewed BSC testnet deployment step; " +
      "it does not authorize mainnet, production funds, or unrestricted liquidity.\n",
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runStage2PredeployGate();
}
