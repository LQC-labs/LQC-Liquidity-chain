import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { validateProductionOracleConfig } from "./verify-master7-7-4-production-oracle-config.mjs";

const CHAIN_ID = 97n;
const root = path.resolve(import.meta.dirname, "..");
const artifact = (source, name) =>
  JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts", source, `${name}.json`)));

export function validateProductionDeploymentAuthorization(env) {
  const config = validateProductionOracleConfig(env);
  if (env.FUTURES_EXECUTE_PRODUCTION_DEPLOYMENT !== "I_UNDERSTAND_THIS_SENDS_BSC_TESTNET_TRANSACTIONS") {
    throw new Error("Explicit production-equivalent BSC Testnet deployment authorization is required.");
  }
  if (!env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required at runtime and must never be committed.");
  }
  const signer = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY);
  if (env.FUTURES_DEPLOYER_ADDRESS && signer.address !== ethers.getAddress(env.FUTURES_DEPLOYER_ADDRESS)) {
    throw new Error("Runtime signer does not match FUTURES_DEPLOYER_ADDRESS.");
  }
  return config;
}

async function checkedDeploy(wallet, provider, a, args, label) {
  const factory = new ethers.ContractFactory(a.abi, a.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  if ((await provider.getCode(address)) === "0x") throw new Error(`${label} deployment has no runtime bytecode.`);
  return contract;
}

export async function deployProductionEquivalentFutures(
  env,
  provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)
) {
  const config = validateProductionDeploymentAuthorization(env);
  if ((await provider.getNetwork()).chainId !== CHAIN_ID) {
    throw new Error("Refusing deployment: expected BSC Testnet chain 97.");
  }

  const wallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const reference = await checkedDeploy(
    wallet,
    provider,
    artifact("futures/LQCV3TwapReferenceAdapter.sol", "LQCV3TwapReferenceAdapter"),
    [config.twapPool, config.indexToken, config.quoteToken, config.observationWindow, BigInt(config.minimumLiquidity)],
    "TWAP reference"
  );
  const oracle = await checkedDeploy(
    wallet,
    provider,
    artifact("futures/LQCAggregatorOracleAdapter.sol", "LQCAggregatorOracleAdapter"),
    [config.owner],
    "Aggregator Oracle"
  );
  const registry = await checkedDeploy(
    wallet,
    provider,
    artifact("futures/LQCFuturesMarketRegistry.sol", "LQCFuturesMarketRegistry"),
    [config.owner],
    "Registry"
  );
  const vault = await checkedDeploy(
    wallet,
    provider,
    artifact("futures/LQCFuturesVault.sol", "LQCFuturesVault"),
    [config.owner],
    "Vault"
  );
  const engine = await checkedDeploy(
    wallet,
    provider,
    artifact("futures/LQCPerpEngine.sol", "LQCPerpEngine"),
    [await registry.getAddress(), await vault.getAddress()],
    "Engine"
  );

  const oracleIface = new ethers.Interface([
    "function setFeed(address indexToken,address feed,uint32 heartbeat)",
    "function setCircuitBreaker(address indexToken,address referenceFeed,uint16 maxDeviationBps)"
  ]);
  const vaultIface = new ethers.Interface(["function setEngine(address newEngine)"]);

  return {
    status: "DEPLOYED_AWAITING_SEPARATE_GOVERNANCE_CONFIGURATION",
    chainId: 97,
    deployer: wallet.address,
    owner: config.owner,
    contracts: {
      reference: await reference.getAddress(),
      oracle: await oracle.getAddress(),
      registry: await registry.getAddress(),
      vault: await vault.getAddress(),
      engine: await engine.getAddress()
    },
    ownerActions: [
      {
        to: await oracle.getAddress(),
        value: "0",
        data: oracleIface.encodeFunctionData("setFeed", [config.indexToken, config.primaryFeed, config.heartbeat]),
        description: "Governance configures the primary production feed."
      },
      {
        to: await oracle.getAddress(),
        value: "0",
        data: oracleIface.encodeFunctionData("setCircuitBreaker", [config.indexToken, await reference.getAddress(), config.maxDeviationBps]),
        description: "Governance configures the independent V3 TWAP circuit breaker."
      },
      {
        to: await vault.getAddress(),
        value: "0",
        data: vaultIface.encodeFunctionData("setEngine", [await engine.getAddress()]),
        description: "Governance authorizes the Futures engine in the Vault."
      }
    ],
    marketActivationAuthorized: false
  };
}

async function main() {
  const result = await deployProductionEquivalentFutures(process.env);
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
