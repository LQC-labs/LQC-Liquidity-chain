import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import { PANCAKE_BSC_TESTNET } from "./validate-bsc-testnet.mjs";

export const BSC_TESTNET_CHAIN_ID = 97;
export const TEST_LQC = "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc";
export const TEST_WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
export const PILOT_FEE = 2500;

const factoryInterface = new ethers.Interface([
  "function createPool(address tokenA,address tokenB,uint24 fee) returns(address pool)",
  "function getPool(address,address,uint24) view returns(address)",
  "function feeAmountTickSpacing(uint24) view returns(int24)",
]);

export function buildPancakeV3PoolTransaction() {
  const createData = factoryInterface.encodeFunctionData("createPool", [TEST_LQC, TEST_WBNB, PILOT_FEE]);
  const getPoolData = factoryInterface.encodeFunctionData("getPool", [TEST_LQC, TEST_WBNB, PILOT_FEE]);
  const feeSpacingData = factoryInterface.encodeFunctionData("feeAmountTickSpacing", [PILOT_FEE]);
  return {
    schemaVersion: 1,
    purpose: "Create the empty LQC tLQC/WBNB PancakeSwap V3 testnet pool",
    network: { name: "BSC Testnet", chainId: BSC_TESTNET_CHAIN_ID },
    contracts: { factory: PANCAKE_BSC_TESTNET.v3Factory, token0Candidate: TEST_LQC, token1Candidate: TEST_WBNB },
    fee: PILOT_FEE,
    transaction: { to: PANCAKE_BSC_TESTNET.v3Factory, value: "0", data: createData },
    readChecks: { getPoolData, feeSpacingData },
    scope: "Creates an empty, uninitialized pool only. It does not approve tokens, set the initial price, or add liquidity.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(buildPancakeV3PoolTransaction(), null, 2)}\n`);
}
