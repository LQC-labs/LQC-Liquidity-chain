import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

export function buildRouter2RouteReadiness(poolRecord, routerDeployment = null, executionDeployment = null, recovery = null, lqcFlow = null, lqcFlowExecution = null) {
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
  const staged = routerDeployment?.executions;
  const addresses = staged ? {
    dexRegistry: staged.registry?.address,
    quoteRouter: staged.quoteRouter?.address,
    pancakeV3Adapter: staged.pancakeV3Adapter?.address,
  } : Object.fromEntries(["dexRegistry", "quoteRouter", "pancakeV3Adapter"].map(name => [name, routerDeployment?.contracts?.[name]?.address]));
  const requiredContracts = ["dexRegistry", "quoteRouter", "pancakeV3Adapter"];
  const missingContracts = requiredContracts.filter(name => !ethers.isAddress(addresses[name]));
  const stagedV3 = staged?.v3Configuration;
  const v3Registered = stagedV3?.status === "success" && stagedV3?.pool?.toLowerCase() === poolRecord.contracts.pancakeV3Pool.toLowerCase() && Number(stagedV3?.feeTier) === 2500 || Array.isArray(routerDeployment?.dexes) && routerDeployment.dexes.some(dex =>
    dex?.kind === "v3" && dex?.enabled !== false && dex?.pools?.some(pool =>
      pool?.address?.toLowerCase() === poolRecord.contracts.pancakeV3Pool.toLowerCase() && Number(pool.fee) === 2500));
  const blockers = [];
  if (!v3Ready) blockers.push("PancakeSwap V3 pilot evidence is incomplete");
  if (missingContracts.length) blockers.push(`Router 2.0 testnet contracts missing: ${missingContracts.join(", ")}`);
  if (!v3Registered) blockers.push("Verified V3 pool is not yet registered through the V3 adapter");
  const lqcFlowCompared = lqcFlow?.comparisonEvidence?.status === "success" &&
    ethers.isAddress(lqcFlow?.comparisonEvidence?.adapter) &&
    BigInt(lqcFlow?.comparisonEvidence?.quotes?.lqcFlow || 0) > 0n &&
    BigInt(lqcFlow?.comparisonEvidence?.quotes?.pancakeV3 || 0) > 0n;
  const comparableRoutes = lqcFlowCompared ? 2 : stagedV3?.status === "success" ? 1 : Array.isArray(routerDeployment?.dexes) ? routerDeployment.dexes.filter(dex => dex.enabled !== false).length : 0;
  const executionReady = ethers.isAddress(executionDeployment?.executions?.riskRegistry?.address) && ethers.isAddress(executionDeployment?.executions?.executionRouter?.address);
  const executionSmokeSucceeded = recovery?.executionEvidence?.status === "success" &&
    recovery?.executionEvidence?.smokeSwap?.status === "success" &&
    ethers.isAddress(recovery?.executionEvidence?.newAdapter) &&
    /^0x[0-9a-f]{64}$/i.test(recovery?.executionEvidence?.smokeSwap?.transactionHash || "");
  const lqcFlowExecutionSucceeded = lqcFlowExecution?.network?.chainId === 97 &&
    lqcFlowExecution?.status === "success" &&
    lqcFlowExecution?.dexId === ethers.id("LQC_FLOW") &&
    lqcFlowExecution?.amountIn === ethers.parseUnits("10", 18).toString() &&
    BigInt(lqcFlowExecution?.amountOut || 0) > 0n &&
    /^0x[0-9a-f]{64}$/i.test(lqcFlowExecution?.transactionHash || "") &&
    lqcFlowExecution?.checks?.userAllowanceAfterExecution === "0" &&
    lqcFlowExecution?.checks?.routerAdapterAllowanceAfterExecution === "0";
  const limitations = comparableRoutes < 2
    ? ["A second independent DEX route is required for real best-route comparison"]
    : lqcFlowExecutionSucceeded
      ? ["Automatic best-route execution remains pending; only each registered route has been executed independently"]
      : ["LQC Flow execution caps still require Governance Safe approval before routed execution"];
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
      status: blockers.length ? "deployment-required" : lqcFlowExecutionSucceeded ? "two-route-independent-execution-success" : lqcFlowCompared ? "two-route-quote-comparison-success" : executionSmokeSucceeded ? "single-route-execution-smoke-success" : executionReady ? "ready-for-single-route-execution-smoke" : "ready-for-live-route-probes",
      comparableRoutes,
      missingContracts,
      v3Registered,
      blockers,
      limitations,
      executionPhase: {
        status: executionReady || ethers.isAddress(routerDeployment?.contracts?.riskRegistry?.address) && ethers.isAddress(routerDeployment?.contracts?.executionRouter?.address)
          ? "deployed" : "separate-deployment-required",
        requiredContracts: ["riskRegistry", "executionRouter"],
      },
      executionSmoke: executionSmokeSucceeded ? {
        status: "success",
        adapter: recovery.executionEvidence.newAdapter,
        transactionHash: recovery.executionEvidence.smokeSwap.transactionHash,
        amountIn: recovery.executionEvidence.smokeSwap.amountIn,
        duplicateExecutionProhibited: true,
      } : { status: "pending" },
      quoteComparison: lqcFlowCompared ? {
        status: "success",
        amountIn: lqcFlow.comparisonEvidence.amountIn,
        lqcFlowAdapter: lqcFlow.comparisonEvidence.adapter,
        quotes: lqcFlow.comparisonEvidence.quotes,
        preferredQuote: lqcFlow.comparisonEvidence.preferredQuote,
        transactionOccurred: false,
      } : { status: "pending" },
      lqcFlowExecution: lqcFlowExecutionSucceeded ? {
        status: "success",
        adapter: lqcFlowExecution.adapter,
        transactionHash: lqcFlowExecution.transactionHash,
        amountIn: lqcFlowExecution.amountIn,
        amountOut: lqcFlowExecution.amountOut,
        duplicateExecutionProhibited: true,
      } : { status: "pending" },
    },
    nextSafeStep: blockers.length
      ? "Deploy and verify the Router 2.0 core plus Pancake V3 adapter before any routed wallet transaction."
      : lqcFlowExecutionSucceeded
        ? "Prepare a read-only automatic best-route execution preflight before any additional swap."
      : lqcFlowCompared
        ? "Prepare Governance Safe approval for LQC Flow DEX token caps, then run a read-only two-route execution preflight before any additional swap."
      : executionSmokeSucceeded
        ? "Preserve the successful single-route evidence and add a second independent DEX route before claiming best-route comparison."
      : executionReady
        ? "Run a read-only execution preflight, then one capped single-route smoke swap. Do not claim best-route comparison until a second DEX route exists."
        : "Run read-only live route probes before enabling execution.",
  };
}

function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const pool = JSON.parse(fs.readFileSync(path.join(root, "deployments/pancake-v3-pool-bsc-testnet-97.json"), "utf8"));
  const stagedRouterFile = path.join(root, "deployments/router2-quote-stack-config-bsc-testnet-97.json");
  const routerFile = path.join(root, "deployments/bsc-testnet-97.json");
  const router = fs.existsSync(stagedRouterFile) ? JSON.parse(fs.readFileSync(stagedRouterFile, "utf8")) : fs.existsSync(routerFile) ? JSON.parse(fs.readFileSync(routerFile, "utf8")) : null;
  const executionFile = path.join(root, "deployments/router2-execution-stack-stage3-bsc-testnet-97.json");
  const execution = fs.existsSync(executionFile) ? JSON.parse(fs.readFileSync(executionFile, "utf8")) : null;
  const recoveryFile = path.join(root, "deployments/router2-v3-adapter-recovery-bsc-testnet-97.json");
  const recovery = fs.existsSync(recoveryFile) ? JSON.parse(fs.readFileSync(recoveryFile, "utf8")) : null;
  const lqcFlowFile = path.join(root, "deployments/router2-lqc-flow-route-bsc-testnet-97.json");
  const lqcFlow = fs.existsSync(lqcFlowFile) ? JSON.parse(fs.readFileSync(lqcFlowFile, "utf8")) : null;
  const lqcFlowExecutionFile = path.join(root, "deployments/router2-lqc-flow-execution-bsc-testnet-97.json");
  const lqcFlowExecution = fs.existsSync(lqcFlowExecutionFile) ? JSON.parse(fs.readFileSync(lqcFlowExecutionFile, "utf8")) : null;
  const output = path.join(root, "deployments/router2-route-readiness-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify(buildRouter2RouteReadiness(pool, router, execution, recovery, lqcFlow, lqcFlowExecution), null, 2)}\n`);
  console.log(`Wrote ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
