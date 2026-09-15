import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import { SIGNER_1, PANCAKE_V3_POOL } from "./prepare-pancake-v3-liquidity.mjs";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "./prepare-pancake-v3-pool.mjs";
import { PANCAKE_BSC_TESTNET } from "./validate-bsc-testnet.mjs";

const artifactPath = path.resolve(import.meta.dirname, "../artifacts/contracts/router-v2/adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json");
const REGISTRY = "0x0465c6460deaece522506e09cddc1b62d6d75c84";
const OLD_ADAPTER = "0x1bffac4b93f48d5ea03bae36dbaee6bedd0a73d4";
const DEX_ID = ethers.id("PANCAKE_V3");

export async function buildRecoveryBundle() {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const deploy = await new ethers.ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(
    PANCAKE_BSC_TESTNET.v3Quoter, PANCAKE_BSC_TESTNET.v3Router, SIGNER_1, 1n,
  );
  const expectedSelector = ethers.id("exactInput((bytes,address,uint256,uint256,uint256))").slice(0, 10);
  if (!artifact.deployedBytecode.includes(expectedSelector.slice(2))) throw new Error("corrected Pancake exactInput selector missing");
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    purpose: "Replace only the ABI-incompatible Pancake V3 execution adapter",
    signer: SIGNER_1,
    registry: REGISTRY,
    oldAdapter: OLD_ADAPTER,
    dexId: DEX_ID,
    priority: 95,
    quoter: PANCAKE_BSC_TESTNET.v3Quoter,
    swapRouter: PANCAKE_BSC_TESTNET.v3Router,
    tokenIn: TEST_LQC,
    tokenOut: TEST_WBNB,
    pool: PANCAKE_V3_POOL,
    fee: PILOT_FEE,
    maxHops: 1,
    correctedExactInputSelector: expectedSelector,
    deployment: { value: "0", data: deploy.data },
    safety: "No risk-limit, Governance Safe, token, liquidity, or router replacement. Registry cutover is disable-update-enable and every stage is read back on-chain.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = path.resolve(import.meta.dirname, "../deployments/router2-v3-adapter-recovery-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify(await buildRecoveryBundle(), null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
