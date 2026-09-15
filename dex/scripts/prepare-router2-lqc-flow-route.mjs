import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { SIGNER_1 } from "./prepare-pancake-v3-liquidity.mjs";
import { TEST_LQC, TEST_WBNB } from "./prepare-pancake-v3-pool.mjs";
import { PILOT_LIMITS } from "./prepare-router2-execution-stack.mjs";

export const LQC_FLOW_ROUTER = "0xA3E1fbe94055e7A8971b3994C7025B3c16273a24";
export const LQC_FLOW_DEX_ID = ethers.id("LQC_FLOW");
const REGISTRY = "0x0465c6460deaece522506e09cddc1b62d6d75c84";
const RISK_REGISTRY = "0xe10a1d467a553900cb4d1755e079b35b0cd0c48b";
const QUOTE_ROUTER = "0xf3128ceed7ef4e4ce48913977fabc341dfbec949";
const artifactsRoot = path.resolve(import.meta.dirname, "../artifacts/contracts/router-v2");
const artifact = relative => JSON.parse(fs.readFileSync(path.join(artifactsRoot, relative), "utf8"));

export async function buildLqcFlowRouteBundle(adapterAddress = null) {
  if (adapterAddress !== null && !ethers.isAddress(adapterAddress)) throw new Error("adapterAddress must be valid");
  const adapterArtifact = artifact("adapters/LQCFlowAdapter.sol/LQCFlowAdapter.json");
  const registryArtifact = artifact("LQCDexRegistry.sol/LQCDexRegistry.json");
  const riskArtifact = artifact("LQCRiskRegistry.sol/LQCRiskRegistry.json");
  const adapterDeploy = await new ethers.ContractFactory(adapterArtifact.abi, adapterArtifact.bytecode)
    .getDeployTransaction(LQC_FLOW_ROUTER);
  const registry = new ethers.Interface(registryArtifact.abi);
  const risk = new ethers.Interface(riskArtifact.abi);
  const routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[TEST_LQC, TEST_WBNB]]);
  const actions = [{ id: 1, action: "deploy-lqc-flow-adapter", to: null, value: "0", data: adapterDeploy.data }];
  if (adapterAddress) {
    actions.push(
      { id: 2, action: "register-lqc-flow", to: REGISTRY, value: "0", data: registry.encodeFunctionData("addDex", [LQC_FLOW_DEX_ID, adapterAddress, "LQC Flow", 100]) },
      { id: 3, action: "cap-lqc-flow-tlqc", to: RISK_REGISTRY, value: "0", data: risk.encodeFunctionData("setDexTokenCap", [LQC_FLOW_DEX_ID, TEST_LQC, PILOT_LIMITS.tLQC.maxPerTransaction]) },
      { id: 4, action: "cap-lqc-flow-wbnb", to: RISK_REGISTRY, value: "0", data: risk.encodeFunctionData("setDexTokenCap", [LQC_FLOW_DEX_ID, TEST_WBNB, PILOT_LIMITS.WBNB.maxPerTransaction]) },
    );
  }
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    phase: "Router 2.0 second independent route preparation",
    signer: SIGNER_1,
    contracts: { lqcFlowRouter: LQC_FLOW_ROUTER, dexRegistry: REGISTRY, riskRegistry: RISK_REGISTRY, quoteRouter: QUOTE_ROUTER },
    tokens: { tokenIn: TEST_LQC, tokenOut: TEST_WBNB },
    dex: { id: LQC_FLOW_DEX_ID, name: "LQC Flow", priority: 100, adapter: adapterAddress },
    routeProbe: { amountIn: ethers.parseUnits("10", 18).toString(), routeData, callMethod: "eth_call" },
    orderedActions: actions,
    status: adapterAddress ? "adapter-address-recorded-actions-prepared" : "deployment-prepared-no-transaction",
    safety: "BSC Testnet only. Reuses the already smoke-tested LQC Flow Router and pool. Does not replace Pancake V3, alter token liquidity, or execute a swap.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundle = await buildLqcFlowRouteBundle(process.env.LQC_FLOW_ADAPTER_ADDRESS || null);
  const output = path.resolve(import.meta.dirname, "../deployments/router2-lqc-flow-route-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
