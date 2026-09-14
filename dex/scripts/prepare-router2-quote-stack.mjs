import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "./prepare-pancake-v3-pool.mjs";
import { SIGNER_1, PANCAKE_V3_POOL } from "./prepare-pancake-v3-liquidity.mjs";
import { PANCAKE_BSC_TESTNET } from "./validate-bsc-testnet.mjs";

export const PANCAKE_V3_DEX_ID = ethers.id("PANCAKE_V3");
const artifactsRoot = path.resolve(import.meta.dirname, "../artifacts/contracts/router-v2");
const artifact = relative => JSON.parse(fs.readFileSync(path.join(artifactsRoot, relative), "utf8"));
const registryArtifact = artifact("LQCDexRegistry.sol/LQCDexRegistry.json");
const quoteRouterArtifact = artifact("LQCQuoteRouter.sol/LQCQuoteRouter.json");
const adapterArtifact = artifact("adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json");
const registry = new ethers.Interface(registryArtifact.abi);
const adapter = new ethers.Interface(adapterArtifact.abi);
const quoteRouter = new ethers.Interface(quoteRouterArtifact.abi);

function deploymentData(contractArtifact, args) {
  return new ethers.ContractFactory(contractArtifact.abi, contractArtifact.bytecode).getDeployTransaction(...args);
}

export async function buildRouter2QuoteStack(registryAddress = null, adapterAddress = null) {
  if (registryAddress !== null && !ethers.isAddress(registryAddress)) throw new Error("registryAddress must be valid");
  if (adapterAddress !== null && !ethers.isAddress(adapterAddress)) throw new Error("adapterAddress must be valid");
  const registryDeploy = await deploymentData(registryArtifact, [SIGNER_1]);
  const adapterDeploy = await deploymentData(adapterArtifact, [
    PANCAKE_BSC_TESTNET.v3Quoter, PANCAKE_BSC_TESTNET.v3Router, SIGNER_1, 1n,
  ]);
  const result = {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    phase: "Router 2.0 read-only quote stack",
    signer: SIGNER_1,
    verifiedPool: PANCAKE_V3_POOL,
    orderedActions: [
      { id: 1, action: "deploy-registry", to: null, value: "0", data: registryDeploy.data },
      { id: 2, action: "deploy-v3-adapter", to: null, value: "0", data: adapterDeploy.data },
    ],
    safety: "Quote-first phase only. No Execution Router, Risk Registry, token approval, liquidity movement, or swap.",
  };
  if (adapterAddress) {
    result.orderedActions.push(
      { id: 3, action: "allow-fee-2500", to: adapterAddress, value: "0", data: adapter.encodeFunctionData("setFeeTierAllowed", [PILOT_FEE, true]) },
      { id: 4, action: "allow-verified-pool", to: adapterAddress, value: "0", data: adapter.encodeFunctionData("setPoolAllowed", [TEST_LQC, TEST_WBNB, PILOT_FEE, true]) },
    );
  }
  if (registryAddress && adapterAddress) {
    result.orderedActions.push({ id: 5, action: "register-v3-adapter", to: registryAddress, value: "0", data: registry.encodeFunctionData("addDex", [PANCAKE_V3_DEX_ID, adapterAddress, "PancakeSwap V3", 95]) });
  }
  if (registryAddress) {
    const quoteRouterDeploy = await deploymentData(quoteRouterArtifact, [registryAddress]);
    result.orderedActions.push({ id: 6, action: "deploy-quote-router", to: null, value: "0", data: quoteRouterDeploy.data });
  }
  return result;
}

export function buildRouter2QuoteProbe(quoteRouterAddress) {
  if (!ethers.isAddress(quoteRouterAddress)) throw new Error("quoteRouterAddress must be valid");
  const amountIn = ethers.parseUnits("1000", 18);
  const routeData = ethers.solidityPacked(["address", "uint24", "address"], [TEST_LQC, PILOT_FEE, TEST_WBNB]);
  return {
    purpose: "Read-only 1,000 tLQC to WBNB quote probe",
    to: quoteRouterAddress,
    value: "0",
    data: quoteRouter.encodeFunctionData("quoteBest", [TEST_LQC, TEST_WBNB, amountIn, [routeData]]),
    tokenIn: TEST_LQC,
    tokenOut: TEST_WBNB,
    amountIn: amountIn.toString(),
    fee: PILOT_FEE,
    routeData,
    callMethod: "eth_call",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = path.resolve(import.meta.dirname, "../deployments/router2-quote-stack-stage1-bsc-testnet-97.json");
  const configOutput = path.resolve(import.meta.dirname, "../deployments/router2-quote-stack-config-bsc-testnet-97.json");
  const previous = fs.existsSync(configOutput) ? JSON.parse(fs.readFileSync(configOutput, "utf8")) :
    (fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : null);
  if (!previous) fs.writeFileSync(output, `${JSON.stringify(await buildRouter2QuoteStack(), null, 2)}\n`);
  const registryAddress = previous?.executions?.registry?.address;
  const adapterAddress = previous?.executions?.pancakeV3Adapter?.address;
  if (registryAddress && adapterAddress) {
    const configured = await buildRouter2QuoteStack(registryAddress, adapterAddress);
    configured.executions = previous.executions;
    const quoteRouterAddress = previous?.executions?.quoteRouter?.address;
    if (quoteRouterAddress) configured.quoteProbe = buildRouter2QuoteProbe(quoteRouterAddress);
    fs.writeFileSync(configOutput, `${JSON.stringify(configured, null, 2)}\n`);
    console.log(`Wrote ${configOutput}`);
  } else {
    console.log(`Wrote ${output}`);
  }
}
