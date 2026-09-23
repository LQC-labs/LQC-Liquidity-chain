import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const CHAIN_ID = 97n;

function artifact(source, name) {
  const file = path.join(root, "artifacts", "contracts", source, name + ".json");
  const a = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!a.bytecode || a.bytecode === "0x") throw new Error("Missing bytecode for " + name);
  return a;
}

function nonZeroAddress(value, label) {
  const a = ethers.getAddress(value);
  if (a === ethers.ZeroAddress) throw new Error(label + " cannot be zero");
  return a;
}

export function validateOracleDeploymentAuthorization(env) {
  if (env.FUTURES_ORACLE_EXECUTE_DEPLOYMENT !== "I_UNDERSTAND_THIS_DEPLOYS_PRODUCTION_EQUIVALENT_ORACLES_TO_BSC_TESTNET") {
    throw new Error("Explicit production-equivalent Oracle deployment authorization is required.");
  }
  if (!env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required at runtime and must never be committed.");

  const wallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY);
  const deployer = nonZeroAddress(env.FUTURES_DEPLOYER_ADDRESS, "FUTURES_DEPLOYER_ADDRESS");
  if (wallet.address !== deployer) throw new Error("Runtime signer does not match FUTURES_DEPLOYER_ADDRESS.");

  const owner = nonZeroAddress(env.FUTURES_OWNER_ADDRESS, "FUTURES_OWNER_ADDRESS");
  const indexToken = nonZeroAddress(env.FUTURES_INDEX_TOKEN, "FUTURES_INDEX_TOKEN");
  const quoteToken = nonZeroAddress(env.FUTURES_QUOTE_TOKEN, "FUTURES_QUOTE_TOKEN");
  const twapPool = nonZeroAddress(env.FUTURES_TWAP_POOL, "FUTURES_TWAP_POOL");
  if (indexToken === quoteToken) throw new Error("Index and quote tokens must differ.");

  const window = Number(env.FUTURES_TWAP_WINDOW);
  const minimumLiquidity = BigInt(env.FUTURES_TWAP_MIN_LIQUIDITY);
  if (!Number.isInteger(window) || window < 300 || window > 86400) throw new Error("TWAP window must be 300..86400 seconds.");
  if (minimumLiquidity <= 0n) throw new Error("TWAP minimum liquidity must be > 0.");

  const reserve = ethers.parseEther(String(env.FUTURES_MIN_TBNB_RESERVE ?? "0.3"));
  const maxSpend = ethers.parseEther(String(env.FUTURES_MAX_ORACLE_DEPLOYMENT_SPEND ?? "0.1"));
  if (reserve < 0n || maxSpend <= 0n) throw new Error("Invalid deployment budget.");

  return { deployer, owner, indexToken, quoteToken, twapPool, window, minimumLiquidity, reserve, maxSpend };
}

async function checkedDeploy(factory, args, provider, label) {
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error(label + " deployment transaction missing.");
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(label + " deployment failed.");
  const address = await contract.getAddress();
  if ((await provider.getCode(address)) === "0x") throw new Error(label + " has no runtime bytecode.");
  return { address, transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
}

export async function deployProductionEquivalentOracles(env, provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)) {
  const config = validateOracleDeploymentAuthorization(env);
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) throw new Error("Refusing deployment: expected BSC Testnet chain 97.");

  const wallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
  const before = await provider.getBalance(wallet.address);
  if (before <= config.reserve) throw new Error("Insufficient tBNB above protected reserve.");

  const primaryArtifact = artifact("futures/LQCAggregatorOracleAdapter.sol", "LQCAggregatorOracleAdapter");
  const twapArtifact = artifact("futures/LQCV3TwapReferenceAdapter.sol", "LQCV3TwapReferenceAdapter");

  const primaryFactory = new ethers.ContractFactory(primaryArtifact.abi, primaryArtifact.bytecode, wallet);
  const twapFactory = new ethers.ContractFactory(twapArtifact.abi, twapArtifact.bytecode, wallet);

  const primary = await checkedDeploy(primaryFactory, [config.owner], provider, "LQCAggregatorOracleAdapter");
  const twap = await checkedDeploy(
    twapFactory,
    [config.twapPool, config.indexToken, config.quoteToken, config.window, config.minimumLiquidity],
    provider,
    "LQCV3TwapReferenceAdapter"
  );

  const after = await provider.getBalance(wallet.address);
  const spent = before - after;
  if (after < config.reserve) throw new Error("Post-deployment balance violated protected reserve.");
  if (spent > config.maxSpend) throw new Error("Oracle deployment exceeded max-spend guard.");

  return {
    status: "DEPLOYED_AWAITING_GOVERNANCE_ORACLE_CONFIGURATION",
    chainId: 97,
    deployer: wallet.address,
    owner: config.owner,
    balanceBeforeTbnb: ethers.formatEther(before),
    balanceAfterTbnb: ethers.formatEther(after),
    spentTbnb: ethers.formatEther(spent),
    contracts: {
      primaryOracleAdapter: primary,
      twapReferenceAdapter: twap
    },
    transactionOccurred: true,
    activationAuthorized: false
  };
}

if (import.meta.url === new URL("file://" + process.argv[1]).href) {
  deployProductionEquivalentOracles(process.env)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e.message); process.exitCode = 1; });
}
