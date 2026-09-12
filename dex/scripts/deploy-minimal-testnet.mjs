import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const {
  BSC_TESTNET_RPC_URL,
  DEPLOYER_PRIVATE_KEY,
  WBNB_ADDRESS,
  TEST_LQC_ADDRESS = "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc",
  MINIMAL_LQC_LIQUIDITY = "1000",
  MINIMAL_BNB_LIQUIDITY = "0.05",
  EXPECTED_CHAIN_ID = "97",
  ALLOW_MINIMAL_TESTNET = ""
} = process.env;

if (ALLOW_MINIMAL_TESTNET !== "true") {
  throw new Error("Set ALLOW_MINIMAL_TESTNET=true. This is a test-only minimal deployment.");
}
if (!BSC_TESTNET_RPC_URL || !/^0x[0-9a-fA-F]{64}$/.test(DEPLOYER_PRIVATE_KEY || "")) {
  throw new Error("Set BSC_TESTNET_RPC_URL and DEPLOYER_PRIVATE_KEY at runtime.");
}
if (!ethers.isAddress(WBNB_ADDRESS) || !ethers.isAddress(TEST_LQC_ADDRESS)) {
  throw new Error("WBNB_ADDRESS and TEST_LQC_ADDRESS must be valid addresses.");
}

const root = path.resolve(import.meta.dirname, "..");
const load = (source) => {
  const name = source.split("/").at(-1);
  return JSON.parse(fs.readFileSync(path.join(root, `artifacts/contracts/${source}.sol/${name}.json`)));
};
const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const network = await provider.getNetwork();
if (network.chainId !== BigInt(EXPECTED_CHAIN_ID) || network.chainId !== 97n) {
  throw new Error("Refusing minimal deployment: expected BSC Testnet chain 97.");
}
for (const [name, address] of [["WBNB", WBNB_ADDRESS], ["tLQC", TEST_LQC_ADDRESS]]) {
  if ((await provider.getCode(address)) === "0x") throw new Error(`${name} has no contract bytecode on BSC Testnet.`);
}
const artifact = source => load(source);
const deploy = async source => {
  const a = artifact(source);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, wallet).deploy(
    ...(source === "LQCFlowFactory" ? [wallet.address] : source === "LQCFlowRouter" ? [factory.target, WBNB_ADDRESS] : [])
  );
  await c.waitForDeployment();
  return c;
};
const factory = await deploy("LQCFlowFactory");
const router = await deploy("LQCFlowRouter");
const tokenAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];
const token = new ethers.Contract(TEST_LQC_ADDRESS, tokenAbi, wallet);
const lqcAmount = ethers.parseUnits(MINIMAL_LQC_LIQUIDITY, 18);
const bnbAmount = ethers.parseEther(MINIMAL_BNB_LIQUIDITY);
if (await token.balanceOf(wallet.address) < lqcAmount) throw new Error("Deployer does not hold enough tLQC for the minimal pool.");
await (await token.approve(router.target, lqcAmount)).wait();
const latest = await provider.getBlock("latest");
const deadline = BigInt((latest?.timestamp || Math.floor(Date.now() / 1000)) + 1800);
const tx = await router.addLiquidityBNB(
  TEST_LQC_ADDRESS, lqcAmount, 0, 0, wallet.address, deadline, { value: bnbAmount }
);
await tx.wait();
const pair = await factory.getPair(TEST_LQC_ADDRESS, WBNB_ADDRESS);
const result = {
  mode: "minimal-testnet-smoke",
  warning: "Not production-ready. No Router 2.0, Safe, timelock, risk, guardian, or monitoring modules.",
  network: { name: "BSC Testnet", chainId: 97, explorer: "https://testnet.bscscan.com" },
  deployer: wallet.address,
  contracts: { tLQC: TEST_LQC_ADDRESS, wbnb: WBNB_ADDRESS, factory: factory.target, router: router.target, pair },
  liquidity: { tLQC: MINIMAL_LQC_LIQUIDITY, tBNB: MINIMAL_BNB_LIQUIDITY },
  transactions: { factory: factory.deploymentTransaction()?.hash, router: router.deploymentTransaction()?.hash, liquidity: tx.hash }
};
const output = path.resolve(process.env.MINIMAL_DEPLOYMENT_FILE || path.join(root, "deployments/minimal-bsc-testnet-97.local.json"));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
