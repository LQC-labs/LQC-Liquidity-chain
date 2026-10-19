const fs = require("fs");
const path = require("path");
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
const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "futures-chain97-wiring-report.json");
let context = {stage: "commit", evidence: null, block: null};
async function main() {
  const {commitEvidence, observationBlock, assertObservationBlock} = await import("./master7-7-evidence-context.mjs");
  context.evidence = commitEvidence(root);
  context.stage = "network";
  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED.chainId) throw new Error(`chainId: expected 97, got ${network.chainId}`);
  console.log("PASS chainId: 97");
  context.stage = "observation-block";
  const block = await observationBlock(provider);
  context.block = block;
  context.stage = "runtime";

  const runtime = {};
  for (const [label,address] of [["Registry",EXPECTED.registry],["Vault",EXPECTED.vault],["Engine",EXPECTED.engine]]) {
    const code = await provider.getCode(address, block.number);
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

  context.stage = "ownership-and-wiring";
  const overrides = {blockTag: block.number};
  const registryOwner = await registry.owner(overrides);
  const vaultOwner = await vault.owner(overrides);
  const vaultEngine = await vault.engine(overrides);
  const engineRegistry = await engine.registry(overrides);
  const engineVault = await engine.vault(overrides);

  assertEq("Registry.owner", registryOwner, EXPECTED.owner);
  assertEq("Vault.owner", vaultOwner, EXPECTED.owner);
  assertEq("Vault.engine", vaultEngine, EXPECTED.engine);
  assertEq("Engine.registry", engineRegistry, EXPECTED.registry);
  assertEq("Engine.vault", engineVault, EXPECTED.vault);

  const registryPendingOwner = await registry.pendingOwner(overrides);
  const vaultPendingOwner = await vault.pendingOwner(overrides);
  console.log(`INFO Registry.pendingOwner: ${registryPendingOwner}`);
  console.log(`INFO Vault.pendingOwner: ${vaultPendingOwner}`);

  context.stage = "block-consistency";
  await assertObservationBlock(provider, block);
  const report = {
    schema: "lqc-master7-7-chain97-wiring-v1",
    status: "VERIFIED_READ_ONLY",
    chainId: Number(network.chainId),
    evidence: context.evidence,
    observedBlockNumber: block.number,
    observedBlockHash: block.hash,
    observedBlockTimestamp: block.timestamp,
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

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log("FINAL PASS: core BSC Testnet Futures wiring matches the recorded deployment.");
}
main().catch(async (error)=>{
  const {writeFailure} = await import("./master7-7-evidence-context.mjs");
  writeFailure(outputPath, context, error);
  console.error("FINAL FAIL:", error.message);
  process.exitCode=1;
});
