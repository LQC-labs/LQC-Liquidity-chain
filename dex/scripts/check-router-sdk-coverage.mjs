import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const coverageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-router-coverage-"));
const mocha = path.resolve("node_modules/.bin/mocha");
const tests = ["test/router-sdk.test.mjs", "test/settlement-proof-invariants.test.mjs"];

try {
  const run = spawnSync(mocha, ["--timeout", "30000", ...tests], {
    stdio: "inherit",
    env: { ...process.env, NODE_V8_COVERAGE: coverageDirectory }
  });
  if (run.status !== 0) process.exit(run.status ?? 1);

  const functions = new Map(), ranges = new Map();
  for (const file of fs.readdirSync(coverageDirectory)) {
    const report = JSON.parse(fs.readFileSync(path.join(coverageDirectory, file), "utf8"));
    for (const script of report.result || []) {
      if (script.url !== "lqc-router-sdk.js") continue;
      for (const fn of script.functions) {
        const root = fn.ranges[0], functionKey = `${fn.functionName}:${root.startOffset}:${root.endOffset}`;
        functions.set(functionKey, Math.max(functions.get(functionKey) || 0, root.count));
        for (const range of fn.ranges) {
          const rangeKey = `${range.startOffset}:${range.endOffset}`;
          ranges.set(rangeKey, Math.max(ranges.get(rangeKey) || 0, range.count));
        }
      }
    }
  }
  if (functions.size === 0) throw new Error("Router SDK coverage was not captured");
  const coveredFunctions = [...functions.values()].filter(Boolean).length;
  const coveredRanges = [...ranges.values()].filter(Boolean).length;
  const functionCoverage = coveredFunctions * 100 / functions.size;
  const rangeCoverage = coveredRanges * 100 / ranges.size;
  const threshold = Number(process.env.LQC_ROUTER_FUNCTION_COVERAGE_MIN || 100);
  console.log(JSON.stringify({ target: "dex/app/router-sdk.js", engine: "Node V8 precise coverage",
    functionCoveragePercent: Number(functionCoverage.toFixed(2)), functions: `${coveredFunctions}/${functions.size}`,
    executedRangePercent: Number(rangeCoverage.toFixed(2)), ranges: `${coveredRanges}/${ranges.size}`,
    functionThresholdPercent: threshold }, null, 2));
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100 || functionCoverage < threshold) {
    throw new Error(`Router SDK function coverage ${functionCoverage.toFixed(2)}% is below ${threshold}%`);
  }
} finally {
  fs.rmSync(coverageDirectory, { recursive: true, force: true });
}
