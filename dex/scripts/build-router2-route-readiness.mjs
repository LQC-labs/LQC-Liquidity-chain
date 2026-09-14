import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

export function buildRouter2RouteReadiness(poolRecord, routerDeployment = null) {
  if (poolRecord?.network?.chainId !== 97 || !ethers.isAddress(poolRecord?.contracts?.pancakeV3Pool)) {
    throw new Error("A valid chain-97 PancakeSwap V3 pool record is required.");
  }
  const v3Ready = poolRecord.creation?.reportedStatus === "success" &&
    poolRecord.initialLiquidityPlan?.status === "executed" &&
    poolRecord.firstSmokeSwap?.status === "success" &&
    poolRecord.reverseSmokeSwap?.status === "success" &&
    poolRecord.finalStateVerification?.status === "success" &&
    poolRecord.finalStateVerification?.routerResidualAllowances?.tLQC === "0" &&
    poolRecord.finalStateVerification?.routerResidualAllowances?.WBNB === "0";
  const requiredContracts = ["dexRegistry", "quoteRouter", "executionRouter", "pancakeV3Adapter"];
  const missingContracts = requiredContracts.filter(name => !ethers.isAddress(routerDeployment?.contracts?.[name]?.address));
  const v3Registered = Array.isArray(routerDeployment?.dexes) && routerDeployment.dexes.some(dex =>
    dex?.kind === "v3" && dex?.enabled !== false && dex?.pools?.some(pool =>
      pool?.address?.toLowerCase() === poolRecord.contracts.pancakeV3Pool.toLowerCase() && Number(pool.fee) === 2500));
  const blockers = [];
  if (!v3Ready) blockers.push("PancakeSwap V3 pilot evidence is incomplete");
  if (missingContracts.length) blockers.push(`Router 2.0 testnet contracts missing: ${missingContracts.join(", ")}`);
  if (!v3Registered) blockers.push("Verified V3 pool is not yet registered through the V3 adapter");
  const comparableRoutes = Array.isArray(routerDeployment?.dexes) ? routerDeployment.dexes.filter(dex => dex.enabled !== false).length : 0;
  if (comparableRoutes < 2) blockers.push("At least two deployed routes are required for real best-route comparison");
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    generatedAt: new Date().toISOString(),
    pancakeV3Pilot: {
      status: v3Ready ? "ready" : "blocked",
      pool: poolRecord.contracts.pancakeV3Pool,
      fee: poolRecord.fee,
      liquidity: poolRecord.finalStateVerification?.poolLiquidity || null,
      lpNftTokenId: poolRecord.finalStateVerification?.lpNftTokenId || null,
      forwardSwap: poolRecord.firstSmokeSwap?.status || "missing",
      reverseSwap: poolRecord.reverseSmokeSwap?.status || "missing",
      residualAllowances: poolRecord.finalStateVerification?.routerResidualAllowances || null,
    },
    router2: {
      status: blockers.length ? "deployment-required" : "ready-for-live-route-probes",
      comparableRoutes,
      missingContracts,
      v3Registered,
      blockers,
    },
    nextSafeStep: blockers.length
      ? "Deploy and verify the Router 2.0 core plus Pancake V3 adapter before any routed wallet transaction."
      : "Run read-only live route probes and compare net output before enabling execution.",
  };
}

function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const pool = JSON.parse(fs.readFileSync(path.join(root, "deployments/pancake-v3-pool-bsc-testnet-97.json"), "utf8"));
  const routerFile = path.join(root, "deployments/bsc-testnet-97.json");
  const router = fs.existsSync(routerFile) ? JSON.parse(fs.readFileSync(routerFile, "utf8")) : null;
  const output = path.join(root, "deployments/router2-route-readiness-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify(buildRouter2RouteReadiness(pool, router), null, 2)}\n`);
  console.log(`Wrote ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
