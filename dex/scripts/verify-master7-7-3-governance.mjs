import { ethers } from "ethers";

const RPC = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const EXPECTED = {
  chainId: 97n,
  owner: "0x89d992f696B40ABbDB6610144faeF336911D8175",
  registry: "0xb1e1Cc4139fCeFdBca1b42aCd69503962A05DF41",
  vault: "0xA6E0Eb7F36e54297C64e80F1Ce6db129065F489E",
  engine: "0x197D0B9571126d58134A4dbFd5f4490426BdDC91",
  txHash: "0x36fd7e9ac6ba89f6f0724f71df84fdb1da29f60200608a598f51a77217ac389f",
  calldata: "0x0e830e49000000000000000000000000197d0b9571126d58134a4dbfd5f4490426bddc91"
};

const ownerAbi = [
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)"
];
const vaultAbi = [...ownerAbi, "function engine() view returns (address)"];
const engineAbi = [
  "function registry() view returns (address)",
  "function vault() view returns (address)"
];

const norm = (x) => ethers.getAddress(x);
function assertAddress(label, actual, expected) {
  if (norm(actual) !== norm(expected)) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  console.log(`PASS ${label}: ${actual}`);
}
function assertHex(label, actual, expected) {
  if ((actual || "").toLowerCase() !== expected.toLowerCase()) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  console.log(`PASS ${label}`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED.chainId) throw new Error(`chainId: expected 97, got ${network.chainId}`);
  console.log("PASS chainId: 97");

  const receipt = await provider.getTransactionReceipt(EXPECTED.txHash);
  if (!receipt) throw new Error("Governance transaction receipt not found");
  if (receipt.status !== 1) throw new Error(`Governance transaction reverted: status=${receipt.status}`);
  console.log(`PASS governance tx receipt: block ${receipt.blockNumber}, status=1`);

  const tx = await provider.getTransaction(EXPECTED.txHash);
  if (!tx) throw new Error("Governance transaction not found");
  assertAddress("tx.from", tx.from, EXPECTED.owner);
  assertAddress("tx.to", tx.to, EXPECTED.vault);
  if (tx.value !== 0n) throw new Error(`tx.value expected 0, got ${tx.value}`);
  console.log("PASS tx.value: 0");
  assertHex("tx.data setEngine(engine)", tx.data, EXPECTED.calldata);

  for (const [label, address] of [
    ["Registry", EXPECTED.registry],
    ["Vault", EXPECTED.vault],
    ["Engine", EXPECTED.engine]
  ]) {
    const code = await provider.getCode(address);
    if (code === "0x") throw new Error(`${label}: no runtime bytecode at ${address}`);
    console.log(`PASS ${label}.runtime: bytecode present`);
  }

  const registry = new ethers.Contract(EXPECTED.registry, ownerAbi, provider);
  const vault = new ethers.Contract(EXPECTED.vault, vaultAbi, provider);
  const engine = new ethers.Contract(EXPECTED.engine, engineAbi, provider);

  assertAddress("Registry.owner", await registry.owner(), EXPECTED.owner);
  assertAddress("Vault.owner", await vault.owner(), EXPECTED.owner);
  assertAddress("Vault.engine", await vault.engine(), EXPECTED.engine);
  assertAddress("Engine.registry", await engine.registry(), EXPECTED.registry);
  assertAddress("Engine.vault", await engine.vault(), EXPECTED.vault);

  console.log(`INFO Registry.pendingOwner: ${await registry.pendingOwner()}`);
  console.log(`INFO Vault.pendingOwner: ${await vault.pendingOwner()}`);
  console.log("FINAL PASS: 7/7-3 Governance Configuration verified on BSC Testnet.");
}

main().catch((e) => {
  console.error("FINAL FAIL:", e.message);
  process.exit(1);
});
