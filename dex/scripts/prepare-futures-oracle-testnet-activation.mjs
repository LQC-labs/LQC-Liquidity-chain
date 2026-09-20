import { ethers } from "ethers";
import { preflightFuturesOracleTestnet } from "./preflight-futures-oracle-testnet.mjs";

const ADAPTER_ABI = [
  "function setFeed(address indexToken,address feed,uint32 heartbeat)",
  "function setCircuitBreaker(address indexToken,address referenceFeed,uint16 maxDeviationBps)",
];

export function buildOracleGovernanceActions(adapterAddress, config) {
  const adapter = ethers.getAddress(adapterAddress);
  if (adapter === ethers.ZeroAddress) throw new Error("FUTURES_ORACLE_ADAPTER must be a non-zero address.");
  const iface = new ethers.Interface(ADAPTER_ABI);
  return [
    {
      order: 1,
      description: "Governance configures the primary Futures price feed.",
      to: adapter,
      value: "0",
      data: iface.encodeFunctionData("setFeed", [config.indexToken, config.primaryFeed, config.heartbeat]),
    },
    {
      order: 2,
      description: "Governance enables the independent reference-feed deviation circuit breaker.",
      to: adapter,
      value: "0",
      data: iface.encodeFunctionData("setCircuitBreaker", [config.indexToken, config.referenceFeed, config.maxDeviationBps]),
    },
  ];
}

export async function prepareOracleActivation(env, provider) {
  const preflight = await preflightFuturesOracleTestnet(env, provider);
  if (!env.FUTURES_ORACLE_ADAPTER) throw new Error("FUTURES_ORACLE_ADAPTER is required.");
  const adapter = ethers.getAddress(env.FUTURES_ORACLE_ADAPTER);
  const effectiveProvider = provider ?? new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL);
  if ((await effectiveProvider.getCode(adapter)) === "0x") throw new Error("FUTURES_ORACLE_ADAPTER has no runtime bytecode.");
  return {
    status: "AWAITING_GOVERNANCE_SIGNATURES",
    readOnly: true,
    preflight,
    actions: buildOracleGovernanceActions(adapter, preflight.config),
  };
}

async function main() {
  const result = await prepareOracleActivation(process.env);
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
