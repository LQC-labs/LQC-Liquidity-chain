const { ethers } = require("ethers");

const RPC = process.env.BSC_TESTNET_RPC || "https://bsc-testnet-dataseed.bnbchain.org";
const EXPECTED = {
  chainId: 97n,
  owner: "0x89d992f696B40ABbDB6610144faeF336911D8175",
  registry: "0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
  vault: "0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
  engine: "0xe4f1320c8709631776c7e39e0916584935882525",
};
const ownerAbi = ["function owner() view returns (address)","function pendingOwner() view returns (address)"];
const vaultAbi = [...ownerAbi,"function engine() view returns (address)"];
const engineAbi = ["function registry() view returns (address)","function vault() view returns (address)"];
const norm = (x) => ethers.getAddress(x);
function assertEq(label, actual, expected) {
  if (norm(actual) !== norm(expected)) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  console.log(`PASS ${label}: ${actual}`);
}
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED.chainId) throw new Error(`chainId: expected 97, got ${network.chainId}`);
  console.log("PASS chainId: 97");

  for (const [label,address] of [["Registry",EXPECTED.registry],["Vault",EXPECTED.vault],["Engine",EXPECTED.engine]]) {
    const code = await provider.getCode(address);
    if (code === "0x") throw new Error(`${label}: no runtime bytecode at ${address}`);
    console.log(`PASS ${label}.runtime: bytecode present`);
  }

  const registry = new ethers.Contract(EXPECTED.registry, ownerAbi, provider);
  const vault = new ethers.Contract(EXPECTED.vault, vaultAbi, provider);
  const engine = new ethers.Contract(EXPECTED.engine, engineAbi, provider);

  assertEq("Registry.owner", await registry.owner(), EXPECTED.owner);
  assertEq("Vault.owner", await vault.owner(), EXPECTED.owner);
  assertEq("Vault.engine", await vault.engine(), EXPECTED.engine);
  assertEq("Engine.registry", await engine.registry(), EXPECTED.registry);
  assertEq("Engine.vault", await engine.vault(), EXPECTED.vault);

  const rp = await registry.pendingOwner();
  const vp = await vault.pendingOwner();
  console.log(`INFO Registry.pendingOwner: ${rp}`);
  console.log(`INFO Vault.pendingOwner: ${vp}`);
  console.log("FINAL PASS: core BSC Testnet Futures wiring matches the recorded deployment.");
}
main().catch((e)=>{ console.error("FINAL FAIL:", e.message); process.exit(1); });
