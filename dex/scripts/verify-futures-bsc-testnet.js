const fs = require("fs");
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

  const runtime = {};
  for (const [label,address] of [["Registry",EXPECTED.registry],["Vault",EXPECTED.vault],["Engine",EXPECTED.engine]]) {
    const code = await provider.getCode(address);
    if (code === "0x") throw new Error(`${label}: no runtime bytecode at ${address}`);
    runtime[label] = {
      address: norm(address),
      codeHash: ethers.keccak256(code),
      runtimeBytes: (code.length - 2) / 2
    };
    console.log(`PASS ${label}.runtime: bytecode present`);
  }

  const registry = new ethers.Contract(EXPECTED.registry, ownerAbi, provider);
  const vault = new ethers.Contract(EXPECTED.vault, vaultAbi, provider);
  const engine = new ethers.Contract(EXPECTED.engine, engineAbi, provider);

  const registryOwner = await registry.owner();
  const vaultOwner = await vault.owner();
  const vaultEngine = await vault.engine();
  const engineRegistry = await engine.registry();
  const engineVault = await engine.vault();

  assertEq("Registry.owner", registryOwner, EXPECTED.owner);
  assertEq("Vault.owner", vaultOwner, EXPECTED.owner);
  assertEq("Vault.engine", vaultEngine, EXPECTED.engine);
  assertEq("Engine.registry", engineRegistry, EXPECTED.registry);
  assertEq("Engine.vault", engineVault, EXPECTED.vault);

  const registryPendingOwner = await registry.pendingOwner();
  const vaultPendingOwner = await vault.pendingOwner();
  console.log(`INFO Registry.pendingOwner: ${registryPendingOwner}`);
  console.log(`INFO Vault.pendingOwner: ${vaultPendingOwner}`);

  const latest = await provider.getBlock("latest");
  const report = {
    schema: "lqc-master7-7-chain97-wiring-v1",
    status: "VERIFIED_READ_ONLY",
    chainId: Number(network.chainId),
    observedBlockNumber: latest.number,
    observedBlockTimestamp: latest.timestamp,
    transactionOccurred: false,
    deploymentAuthorized: false,
    activationAuthorized: false,
    expected: {
      owner: norm(EXPECTED.owner),
      registry: norm(EXPECTED.registry),
      vault: norm(EXPECTED.vault),
      engine: norm(EXPECTED.engine)
    },
    runtime,
    ownership: {
      registryOwner: norm(registryOwner),
      registryPendingOwner: norm(registryPendingOwner),
      vaultOwner: norm(vaultOwner),
      vaultPendingOwner: norm(vaultPendingOwner)
    },
    wiring: {
      vaultEngine: norm(vaultEngine),
      engineRegistry: norm(engineRegistry),
      engineVault: norm(engineVault)
    }
  };

  fs.writeFileSync("futures-chain97-wiring-report.json", JSON.stringify(report, null, 2) + "\n");
  console.log("FINAL PASS: core BSC Testnet Futures wiring matches the recorded deployment.");
}
main().catch((e)=>{ console.error("FINAL FAIL:", e.message); process.exit(1); });
