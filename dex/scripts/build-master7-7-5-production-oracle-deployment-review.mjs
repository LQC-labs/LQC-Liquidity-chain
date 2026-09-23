import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { validateProductionOracleConfig } from "./verify-master7-7-4-production-oracle-config.mjs";

const root = path.resolve(import.meta.dirname, "..");
const artifact = (source, name) => {
  const file = path.join(root, "artifacts", "contracts", source, name + ".json");
  const a = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!a.bytecode || a.bytecode === "0x") throw new Error("Missing bytecode for " + name);
  return a;
};

export async function buildProductionOracleDeploymentReview(env) {
  const config = validateProductionOracleConfig(env);
  const deployer = ethers.getAddress(env.FUTURES_DEPLOYER_ADDRESS);
  if (!/^\\d+$/.test(String(env.FUTURES_DEPLOYER_NONCE ?? ""))) throw new Error("FUTURES_DEPLOYER_NONCE must be a non-negative integer");
  const nonce = BigInt(env.FUTURES_DEPLOYER_NONCE);

  const primary = artifact("futures/LQCAggregatorOracleAdapter.sol", "LQCAggregatorOracleAdapter");
  const twap = artifact("futures/LQCV3TwapReferenceAdapter.sol", "LQCV3TwapReferenceAdapter");

  const primaryFactory = new ethers.ContractFactory(primary.abi, primary.bytecode);
  const twapFactory = new ethers.ContractFactory(twap.abi, twap.bytecode);

  const primaryTx = await primaryFactory.getDeployTransaction(config.owner);
  const twapTx = await twapFactory.getDeployTransaction(
    config.twapPool,
    config.indexToken,
    config.quoteToken,
    config.observationWindow,
    config.minimumLiquidity
  );

  const primaryAddress = ethers.getCreateAddress({from: deployer, nonce});
  const twapAddress = ethers.getCreateAddress({from: deployer, nonce: nonce + 1n});

  const primaryIface = new ethers.Interface(primary.abi);
  const setFeedData = primaryIface.encodeFunctionData("setFeed", [
    config.indexToken,
    config.primaryFeed,
    config.heartbeat
  ]);
  const setCircuitBreakerData = primaryIface.encodeFunctionData("setCircuitBreaker", [
    config.indexToken,
    twapAddress,
    config.maxDeviationBps
  ]);

  return {
    schema: "lqc-master7-7-5-production-oracle-deployment-review-v1",
    status: "READY_FOR_SEPARATELY_AUTHORIZED_TESTNET_DEPLOYMENT",
    chainId: 97,
    transactionAuthorized: false,
    deployer,
    startingNonce: nonce.toString(),
    owner: config.owner,
    deployments: [
      {
        id: "primaryOracle",
        contract: "LQCAggregatorOracleAdapter",
        predictedAddress: primaryAddress,
        constructorArgs: [config.owner],
        data: primaryTx.data
      },
      {
        id: "twapReference",
        contract: "LQCV3TwapReferenceAdapter",
        predictedAddress: twapAddress,
        constructorArgs: [
          config.twapPool,
          config.indexToken,
          config.quoteToken,
          config.observationWindow,
          config.minimumLiquidity
        ],
        data: twapTx.data
      }
    ],
    governanceActions: [
      {
        to: primaryAddress,
        value: "0",
        method: "setFeed",
        data: setFeedData
      },
      {
        to: primaryAddress,
        value: "0",
        method: "setCircuitBreaker",
        data: setCircuitBreakerData
      }
    ],
    parameters: {
      indexToken: config.indexToken,
      quoteToken: config.quoteToken,
      primaryFeed: config.primaryFeed,
      twapPool: config.twapPool,
      heartbeat: config.heartbeat,
      maxDeviationBps: config.maxDeviationBps,
      observationWindow: config.observationWindow,
      minimumLiquidity: config.minimumLiquidity
    }
  };
}

if (import.meta.url === new URL("file://" + process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await buildProductionOracleDeploymentReview(process.env), null, 2));
  } catch (e) {
    console.error("FINAL FAIL:", e.message);
    process.exit(1);
  }
}
