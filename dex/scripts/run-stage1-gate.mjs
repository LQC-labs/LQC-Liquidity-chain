import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  ["Chart locale syntax", ["run", "check:chart-locale"]],
  ["Browser application syntax", ["run", "check:app"]],
  ["Solidity compilation and complete security suite", ["run", "test:contracts"]],
  ["Router SDK coverage threshold", ["run", "coverage:router-sdk"]],
];

for (const [label, args] of checks) {
  process.stdout.write(`\n[Stage 1] ${label}\n`);
  const result = spawnSync(npm, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`\nStage 1 gate failed: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(
  "\nStage 1 repository gate passed. Live BSC testnet deployment, address review, " +
    "route probes, and operational sign-off remain Stage 2 requirements.\n",
);
