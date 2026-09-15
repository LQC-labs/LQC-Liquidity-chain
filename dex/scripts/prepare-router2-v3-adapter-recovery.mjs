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
    executionEvidence: {
      status: "success",
      newAdapter: "0x823025d02c7619967b3e3880e3f6bc324a2c56d4",
      configuration: { feeTier: 2500, verifiedPool: PANCAKE_V3_POOL, status: "success" },
      registryCutover: {
        status: "success",
        disabledTransactionHash: "0x9ace5920d69d4874f788968eacff5ed96a7290afe79da1a197350b10d0e8d059",
        updatedTransactionHash: "0x24045b1f9854b4ec1aa9d0db1fb542a3b3bf51ea34d66d95bd65b8fb9c6aca96",
        enabledTransactionHash: "0x04347b6b4b39cb066161aed9b4af739714a50a17b8c30b3fb9a13baf91880f2f",
      },
      smokeSwap: {
        status: "success",
        transactionHash: "0x4e969b9cb637bd76bc4c6106dca333d0cfb7e0cb7d2e7a400b60756ca2ca5a5f",
        amountIn: ethers.parseUnits("10", 18).toString(),
        minimumAmountOut: "9855441000000",
        route: "tLQC -> PancakeSwap V3 0.25% -> WBNB",
        duplicateExecutionProhibited: true,
      },
      evidence: "TokenPocket receipts plus post-cutover read-only checks and successful pre-submission simulation",
    },
    safety: "No risk-limit, Governance Safe, token, liquidity, or router replacement. Registry cutover is disable-update-enable and every stage is read back on-chain.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = path.resolve(import.meta.dirname, "../deployments/router2-v3-adapter-recovery-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify(await buildRecoveryBundle(), null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
