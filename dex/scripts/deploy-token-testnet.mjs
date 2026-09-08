import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/tokenomics-12pct.json"), "utf8"));
const { BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY, TGE_TIMESTAMP, EXPECTED_CHAIN_ID = "97" } = process.env;

if (!BSC_TESTNET_RPC_URL || !DEPLOYER_PRIVATE_KEY || !TGE_TIMESTAMP) {
  throw new Error("Set BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY, and TGE_TIMESTAMP.");
}

const walletKey = (id) => `${id.toUpperCase()}_WALLET`;
for (const allocation of config.allocations) {
  const address = process.env[walletKey(allocation.id)];
  if (!ethers.isAddress(address)) throw new Error(`${walletKey(allocation.id)} must be a valid multisig/beneficiary address.`);
}

const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const signer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const network = await provider.getNetwork();
if (network.chainId !== BigInt(EXPECTED_CHAIN_ID) || network.chainId === 56n) {
  throw new Error(`Refusing token test deployment on chain ${network.chainId}; expected non-mainnet chain ${EXPECTED_CHAIN_ID}.`);
}

const artifact = (source, name) => JSON.parse(fs.readFileSync(path.join(root, `artifacts/contracts/${source}.sol/${name}.json`)));
const deploy = async (source, name, args) => {
  const item = artifact(source, name);
  const contract = await new ethers.ContractFactory(item.abi, item.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
};

const token = await deploy("token/LQCToken", "LQCToken", [signer.address]);
const tokenAddress = await token.getAddress();
const secondsPerMonth = 30 * 24 * 60 * 60;
const tge = Number(TGE_TIMESTAMP);
if (!Number.isInteger(tge) || tge <= Math.floor(Date.now() / 1000)) throw new Error("TGE_TIMESTAMP must be a future Unix timestamp.");

const results = [];
for (const item of config.allocations) {
  const beneficiary = process.env[walletKey(item.id)];
  const total = ethers.parseUnits(item.total, 18);
  const unlocked = ethers.parseUnits(item.tgeUnlocked, 18);
  const locked = total - unlocked;
  let vault = null;
  if (locked > 0n) {
    vault = await deploy("token/LQCAllocationVault", "LQCAllocationVault", [
      tokenAddress,
      beneficiary,
      tge,
      item.cliffMonths * secondsPerMonth,
      item.vestingMonths * secondsPerMonth,
      locked
    ]);
    await (await token.transfer(await vault.getAddress(), locked)).wait();
  }
  if (unlocked > 0n) await (await token.transfer(beneficiary, unlocked)).wait();
  results.push({
    id: item.id,
    beneficiary,
    total: item.total,
    tgeUnlocked: item.tgeUnlocked,
    vault: vault ? await vault.getAddress() : null,
    locked: ethers.formatUnits(locked, 18)
  });
}

if ((await token.balanceOf(signer.address)) !== 0n) throw new Error("Distribution incomplete: deployer still holds LQC.");
if ((await token.totalSupply()) !== ethers.parseUnits(config.token.maxSupply, 18)) throw new Error("Unexpected total supply.");

const record = {
  generatedAt: new Date().toISOString(),
  network: { name: "BSC Testnet", chainId: Number(network.chainId) },
  tgeTimestamp: tge,
  deployer: signer.address,
  token: tokenAddress,
  maxSupply: config.token.maxSupply,
  tgeCirculatingSupply: config.tgeCirculatingSupply,
  allocations: results,
  verification: { sourceVerified: false, addressesReviewed: false, multisigOwnersReviewed: false }
};
fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
const output = path.join(root, `deployments/lqc-token-bsc-testnet-${network.chainId}.json`);
fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));

