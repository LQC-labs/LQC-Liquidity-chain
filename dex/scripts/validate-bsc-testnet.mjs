import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

export const PANCAKE_BSC_TESTNET = Object.freeze({
  v2Factory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
  v2Router: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
  v3Factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  v3Router: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
  v3Quoter: "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2"
});

const same = (a, b) => ethers.getAddress(a) === ethers.getAddress(b);
export function assertBscTestnetChain(chainId) {
  if (BigInt(chainId) !== 97n) throw new Error(`Refusing validation on chain ${chainId}; expected BSC testnet 97.`);
}
export async function assertContractCode(provider, namedAddresses) {
  for (const [name, address] of Object.entries(namedAddresses)) {
    if (!ethers.isAddress(address)) throw new Error(`${name} has an invalid address.`);
    if (await provider.getCode(address) === "0x") throw new Error(`${name} has no deployed bytecode.`);
  }
}
export function deploymentContractAddresses(deployment) {
  if (Number(deployment?.network?.chainId) !== 97) throw new Error("Deployment record must target BSC testnet chain 97.");
  const required = ["dexRegistry", "riskRegistry", "emergencyController", "executionRouter", "timelock"];
  return Object.fromEntries(required.map(name => {
    const address = deployment?.contracts?.[name]?.address;
    if (!ethers.isAddress(address)) throw new Error(`Deployment record is missing ${name}.`);
    return [`lqc.${name}`, address];
  }));
}

export function validateDeploymentDexRecords(records, onchainDexes) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("Deployment record has no registered DEXes.");
  if (records.length !== onchainDexes.length) throw new Error("Registered DEX count differs from deployment record.");
  const seen = new Set();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const onchain = onchainDexes[i];
    if (!ethers.isHexString(record?.id, 32)) throw new Error(`DEX record ${i} has an invalid id.`);
    const key = record.id.toLowerCase();
    if (seen.has(key)) throw new Error(`DEX record ${i} duplicates an id.`);
    seen.add(key);
    if (record.id.toLowerCase() !== onchain.id.toLowerCase()) throw new Error(`DEX record ${i} id/order mismatch.`);
    if (!onchain.enabled) throw new Error(`${record.name || record.id} is disabled in the registry.`);
    if (record.adapter && !same(record.adapter, onchain.adapter)) {
      throw new Error(`${record.name || record.id} adapter mismatch.`);
    }
  }
}

export async function validateBscTestnet({ provider, deployment }) {
  const network = await provider.getNetwork();
  assertBscTestnetChain(network.chainId);
  const lqcAddresses = deploymentContractAddresses(deployment);
  await assertContractCode(provider, { ...PANCAKE_BSC_TESTNET, ...lqcAddresses });

  const v2Abi = ["function factory() view returns(address)", "function WETH() view returns(address)"];
  const v3Abi = ["function factory() view returns(address)", "function WETH9() view returns(address)"];
  const v2 = new ethers.Contract(PANCAKE_BSC_TESTNET.v2Router, v2Abi, provider);
  const v3 = new ethers.Contract(PANCAKE_BSC_TESTNET.v3Router, v3Abi, provider);
  const quoter = new ethers.Contract(PANCAKE_BSC_TESTNET.v3Quoter, v3Abi, provider);
  const [v2Factory, v2Wbnb, v3Factory, v3Wbnb, quoterFactory, quoterWbnb] = await Promise.all([
    v2.factory(), v2.WETH(), v3.factory(), v3.WETH9(), quoter.factory(), quoter.WETH9()
  ]);
  if (!same(v2Factory, PANCAKE_BSC_TESTNET.v2Factory)) throw new Error("PancakeSwap V2 Router/Factory mismatch.");
  if (!same(v3Factory, PANCAKE_BSC_TESTNET.v3Factory) || !same(quoterFactory, PANCAKE_BSC_TESTNET.v3Factory)) {
    throw new Error("PancakeSwap V3 Router/Quoter Factory mismatch.");
  }
  if (!same(v2Wbnb, v3Wbnb) || !same(v3Wbnb, quoterWbnb)) throw new Error("PancakeSwap WBNB mismatch.");

  const registry = new ethers.Contract(deployment.contracts.dexRegistry.address, [
    "function owner() view returns(address)", "function pauseAdmin() view returns(address)",
    "function dexCount() view returns(uint256)", "function dexIdAt(uint256) view returns(bytes32)",
    "function getDex(bytes32) view returns(address adapter,bool enabled,uint32 priority)"
  ], provider);
  const risk = new ethers.Contract(deployment.contracts.riskRegistry.address, [
    "function owner() view returns(address)", "function pauseAdmin() view returns(address)", "function executor() view returns(address)", "function swapsPaused() view returns(bool)"
  ], provider);
  const [registryOwner, registryPauseAdmin, dexCount, riskOwner, riskPauseAdmin, executor, swapsPaused] = await Promise.all([
    registry.owner(), registry.pauseAdmin(), registry.dexCount(), risk.owner(), risk.pauseAdmin(), risk.executor(), risk.swapsPaused()
  ]);
  const timelock = deployment.contracts.timelock.address, emergency = deployment.contracts.emergencyController.address;
  if (!same(registryOwner, timelock) || !same(riskOwner, timelock)) throw new Error("Registry ownership is not held by the timelock.");
  if (!same(registryPauseAdmin, emergency) || !same(riskPauseAdmin, emergency)) throw new Error("Emergency pause authority mismatch.");
  if (!same(executor, deployment.contracts.executionRouter.address)) throw new Error("Risk executor mismatch.");

  const onchainDexes = await Promise.all(Array.from({ length: Number(dexCount) }, async (_, index) => {
    const id = await registry.dexIdAt(index);
    const [adapter, enabled, priority] = await registry.getDex(id);
    return { id, adapter, enabled, priority: Number(priority) };
  }));
  validateDeploymentDexRecords(deployment.dexes, onchainDexes);
  await assertContractCode(provider, Object.fromEntries(onchainDexes.map((dex, index) => [
    `lqc.dexAdapter.${deployment.dexes[index].name || index}`, dex.adapter
  ])));

  const execution = new ethers.Contract(deployment.contracts.executionRouter.address, [
    "function registry() view returns(address)", "function riskRegistry() view returns(address)"
  ], provider);
  const emergencyController = new ethers.Contract(emergency, [
    "function registry() view returns(address)", "function riskRegistry() view returns(address)"
  ], provider);
  const timelockContract = new ethers.Contract(timelock, [
    "function proposer() view returns(address)", "function delay() view returns(uint256)", "function MIN_DELAY() view returns(uint256)"
  ], provider);
  const [executionRegistry, executionRisk, emergencyRegistry, emergencyRisk, proposer, delay, minDelay] = await Promise.all([
    execution.registry(), execution.riskRegistry(), emergencyController.registry(), emergencyController.riskRegistry(),
    timelockContract.proposer(), timelockContract.delay(), timelockContract.MIN_DELAY()
  ]);
  if (!same(executionRegistry, deployment.contracts.dexRegistry.address) ||
      !same(executionRisk, deployment.contracts.riskRegistry.address)) throw new Error("Execution Router module linkage mismatch.");
  if (!same(emergencyRegistry, deployment.contracts.dexRegistry.address) ||
      !same(emergencyRisk, deployment.contracts.riskRegistry.address)) throw new Error("Emergency Controller module linkage mismatch.");
  if (!ethers.isAddress(proposer) || proposer === ethers.ZeroAddress || delay < minDelay) {
    throw new Error("Timelock configuration is unsafe.");
  }

  return {
    chainId: Number(network.chainId),
    pancake: { ...PANCAKE_BSC_TESTNET, wbnb: v2Wbnb },
    lqc: {
      contractCount: Object.keys(lqcAddresses).length,
      dexCount: Number(dexCount),
      activeDexCount: onchainDexes.filter(dex => dex.enabled).length,
      swapsPaused,
      timelockDelaySeconds: Number(delay)
    },
    safeForSmokeTest: !swapsPaused
  };
}

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  if (!rpcUrl) throw new Error("Set BSC_TESTNET_RPC_URL. Never commit RPC credentials or private keys.");
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentPath = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const result = await validateBscTestnet({ provider: new ethers.JsonRpcProvider(rpcUrl), deployment });
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), deploymentPath, ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
