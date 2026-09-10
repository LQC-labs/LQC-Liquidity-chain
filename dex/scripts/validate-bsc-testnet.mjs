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
const REQUIRED_DEPLOYMENT_EVIDENCE = Object.freeze([
  "lqc", "mockUsdt", "factory", "router", "dexRegistry", "timelock", "emergencyController",
  "riskRegistry", "quoteRouter", "executionRouter", "nativeRouter", "splitOptimizer", "autoRouter",
  "gasCostOracle", "flowAdapter", "liquidityVault", "idleStrategyAdapter"
]);
export function assertBscTestnetChain(chainId) {
  if (BigInt(chainId) !== 97n) throw new Error(`Refusing validation on chain ${chainId}; expected BSC testnet 97.`);
}
export async function assertContractCode(provider, namedAddresses) {
  for (const [name, address] of Object.entries(namedAddresses)) {
    if (!ethers.isAddress(address)) throw new Error(`${name} has an invalid address.`);
    if (await provider.getCode(address) === "0x") throw new Error(`${name} has no deployed bytecode.`);
  }
}

/// @notice Fails closed unless every reviewed V3 route resolves to a deployed pool in the
/// canonical PancakeSwap V3 factory. This prevents a manually approved token/fee tuple from
/// reaching deployment evidence when the pool is absent or points to an undeployed address.
export async function assertPancakeV3PoolsExist(provider, pools) {
  if (!Array.isArray(pools) || pools.length === 0) {
    throw new Error("PancakeSwap V3 requires at least one reviewed pool.");
  }
  const factory = new ethers.Contract(PANCAKE_BSC_TESTNET.v3Factory, [
    "function getPool(address,address,uint24) view returns(address)"
  ], provider);
  const seen = new Set();
  for (const pool of pools) {
    if (!ethers.isAddress(pool?.tokenA) || !ethers.isAddress(pool?.tokenB) ||
        same(pool.tokenA, pool.tokenB) || !Number.isInteger(Number(pool.fee))) {
      throw new Error("PancakeSwap V3 reviewed pool configuration is invalid.");
    }
    const [token0, token1] = [ethers.getAddress(pool.tokenA), ethers.getAddress(pool.tokenB)].sort();
    const key = `${token0}:${token1}:${Number(pool.fee)}`;
    if (seen.has(key)) throw new Error("PancakeSwap V3 reviewed pool configuration contains a duplicate pool.");
    seen.add(key);
    const poolAddress = await factory.getPool(token0, token1, Number(pool.fee));
    if (!ethers.isAddress(poolAddress) || poolAddress === ethers.ZeroAddress) {
      throw new Error(`PancakeSwap V3 reviewed pool does not exist: ${key}.`);
    }
    if (await provider.getCode(poolAddress) === "0x") {
      throw new Error(`PancakeSwap V3 reviewed pool has no deployed bytecode: ${key}.`);
    }
  }
  return true;
}
export function deploymentContractAddresses(deployment) {
  if (Number(deployment?.network?.chainId) !== 97) throw new Error("Deployment record must target BSC testnet chain 97.");
  const required = ["dexRegistry", "riskRegistry", "emergencyController", "executionRouter", "timelock", "gasCostOracle",
    "liquidityVault", "idleStrategyAdapter"];
  return Object.fromEntries(required.map(name => {
    const address = deployment?.contracts?.[name]?.address;
    if (!ethers.isAddress(address)) throw new Error(`Deployment record is missing ${name}.`);
    return [`lqc.${name}`, address];
  }));
}

export function validateDeploymentEvidenceRecord(deployment) {
  if (Number(deployment?.network?.chainId) !== 97) throw new Error("Deployment evidence must target BSC testnet chain 97.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(deployment?.deployer || "") ||
      !/^0x[0-9a-fA-F]{40}$/.test(deployment?.owner || "") ||
      !/^0x[0-9a-fA-F]{40}$/.test(deployment?.riskAdmin || "")) {
    throw new Error("Deployment evidence is missing valid deployer, governance, or risk addresses.");
  }
  if (same(deployment.owner, deployment.riskAdmin)) throw new Error("Deployment evidence does not separate governance and risk roles.");
  if (!/^[0-9a-fA-F]{40}$/.test(deployment?.sourceRevision || "")) {
    throw new Error("Deployment evidence must pin a full 40-character source commit SHA.");
  }
  if (typeof deployment?.generatedAt !== "string" || Number.isNaN(Date.parse(deployment.generatedAt))) {
    throw new Error("Deployment evidence has an invalid generation timestamp.");
  }
  const compiler = deployment?.compiler;
  if (compiler?.version !== "0.8.30" || compiler?.optimizer?.enabled !== true ||
      compiler?.optimizer?.runs !== 200 || compiler?.viaIR !== true || compiler?.evmVersion !== "shanghai") {
    throw new Error("Deployment evidence compiler settings do not match the reviewed build.");
  }
  const required = [...REQUIRED_DEPLOYMENT_EVIDENCE];
  if (deployment?.contracts?.pancakeAdapter) required.push("pancakeAdapter");
  if (deployment?.contracts?.pancakeV3Adapter) required.push("pancakeV3Adapter");
  for (const name of required) {
    const item = deployment?.contracts?.[name];
    if (!ethers.isAddress(item?.address)) throw new Error(`Deployment evidence is missing ${name} address.`);
    if (!ethers.isHexString(item?.deploymentTx, 32)) throw new Error(`Deployment evidence is missing ${name} transaction hash.`);
  }
  return { sourceRevision: deployment.sourceRevision.toLowerCase(), contractCount: required.length };
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

export function validateV3DeploymentRecord(record) {
  const canonicalFees = new Set([100, 500, 2500, 10000]);
  if (record?.kind !== "v3") throw new Error("PancakeSwap V3 deployment record is missing or has the wrong kind.");
  if (!Number.isInteger(record.maxHops) || record.maxHops < 1 || record.maxHops > 3) {
    throw new Error("PancakeSwap V3 maxHops must be an integer from 1 to 3.");
  }
  if (!Array.isArray(record.feeTiers) || record.feeTiers.length === 0 ||
      new Set(record.feeTiers).size !== record.feeTiers.length ||
      record.feeTiers.some(fee => !canonicalFees.has(Number(fee)))) {
    throw new Error("PancakeSwap V3 fee tiers are invalid.");
  }
  if (!Array.isArray(record.pools) || record.pools.length === 0) {
    throw new Error("PancakeSwap V3 deployment record has no reviewed pools.");
  }
  const poolKeys = new Set();
  for (const pool of record.pools) {
    if (!ethers.isAddress(pool?.tokenA) || !ethers.isAddress(pool?.tokenB) ||
        same(pool.tokenA, pool.tokenB) || !record.feeTiers.includes(Number(pool.fee))) {
      throw new Error("PancakeSwap V3 deployment record contains an invalid pool.");
    }
    const [token0, token1] = [ethers.getAddress(pool.tokenA), ethers.getAddress(pool.tokenB)].sort();
    const key = `${token0}:${token1}:${Number(pool.fee)}`;
    if (poolKeys.has(key)) throw new Error("PancakeSwap V3 deployment record contains a duplicate pool.");
    poolKeys.add(key);
  }
  return record;
}

export function validateRiskAdministrator(deployment, onchainRiskAdmin) {
  if (!ethers.isAddress(deployment?.owner) || !ethers.isAddress(deployment?.riskAdmin)) {
    throw new Error("Deployment record is missing governance or risk administrator.");
  }
  if (!ethers.isAddress(onchainRiskAdmin) || !same(onchainRiskAdmin, deployment.riskAdmin)) {
    throw new Error("Risk administrator does not match the deployment record.");
  }
  if (same(deployment.riskAdmin, deployment.owner)) {
    throw new Error("Risk administrator is not separated from protocol governance.");
  }
  return ethers.getAddress(onchainRiskAdmin);
}

export function validateVaultDeploymentRecord(deployment, onchain) {
  const vault = deployment?.contracts?.liquidityVault;
  const adapter = deployment?.contracts?.idleStrategyAdapter;
  const roles = deployment?.liquidityVaultRoles;
  if (!vault || !adapter || !roles) throw new Error("Deployment record is missing Vault configuration.");
  for (const [name, address] of Object.entries({
    vault: vault.address, vaultAsset: vault.asset, adapter: adapter.address,
    adapterAsset: adapter.asset, adapterVault: adapter.vault,
    owner: roles.owner, pauseAdmin: roles.pauseAdmin, strategyAdmin: roles.strategyAdmin
  })) if (!ethers.isAddress(address)) throw new Error(`Vault record has an invalid ${name} address.`);
  if (!same(vault.asset, adapter.asset) || !same(vault.address, adapter.vault)) {
    throw new Error("Vault and strategy adapter linkage does not match the deployment record.");
  }
  if (same(roles.owner, roles.pauseAdmin) || same(roles.owner, roles.strategyAdmin)) {
    throw new Error("Vault operational roles are not separated from governance.");
  }
  if (!same(onchain.owner, roles.owner) || !same(onchain.pauseAdmin, roles.pauseAdmin) ||
      !same(onchain.strategyAdmin, roles.strategyAdmin)) throw new Error("Vault role configuration mismatch.");
  if (!same(onchain.asset, vault.asset) || !same(onchain.strategy, adapter.address) ||
      !same(onchain.adapterAsset, adapter.asset) || !same(onchain.adapterVault, adapter.vault)) {
    throw new Error("Vault on-chain asset or strategy linkage mismatch.");
  }
  if (BigInt(onchain.depositCap) !== BigInt(vault.depositCap) ||
      BigInt(onchain.strategyCap) !== BigInt(vault.strategyCap) ||
      BigInt(onchain.maxLossBps) !== BigInt(vault.maxLossBps)) throw new Error("Vault limit configuration mismatch.");
  if (vault.allocationsPaused !== true) {
    throw new Error("Fresh Vault deployment record must require paused strategy allocations.");
  }
  if (onchain.allocationsPaused !== vault.allocationsPaused) {
    throw new Error("Vault allocation pause state does not match the deployment record.");
  }
  if (BigInt(onchain.strategyDebt) !== 0n || BigInt(onchain.accountedAssets) !== 0n ||
      BigInt(onchain.adapterManagedAssets) !== 0n) throw new Error("Fresh Vault deployment contains unexpected accounting state.");
  if (onchain.insolvent) throw new Error("Vault reports an insolvent accounting state.");
  return true;
}

export async function validateBscTestnet({ provider, deployment }) {
  const evidence = validateDeploymentEvidenceRecord(deployment);
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

  const gasCostOracle = new ethers.Contract(deployment.contracts.gasCostOracle.address, [
    "function owner() view returns(address)", "function wrappedNative() view returns(address)"
  ], provider);
  const [gasOracleOwner, gasOracleWrappedNative] = await Promise.all([
    gasCostOracle.owner(), gasCostOracle.wrappedNative()
  ]);
  if (!same(gasOracleOwner, deployment.contracts.timelock.address)) {
    throw new Error("Gas-cost oracle ownership is not held by the timelock.");
  }
  if (!same(gasOracleWrappedNative, v2Wbnb)) throw new Error("Gas-cost oracle WBNB mismatch.");

  const vaultRecord = deployment.contracts.liquidityVault;
  const adapterRecord = deployment.contracts.idleStrategyAdapter;
  const vault = new ethers.Contract(vaultRecord.address, [
    "function owner() view returns(address)", "function pauseAdmin() view returns(address)",
    "function strategyAdmin() view returns(address)", "function asset() view returns(address)",
    "function strategy() view returns(address)", "function depositCap() view returns(uint256)",
    "function strategyCap() view returns(uint256)", "function maxLossBps() view returns(uint256)",
    "function strategyDebt() view returns(uint256)", "function accountedAssets() view returns(uint256)",
    "function depositsPaused() view returns(bool)", "function allocationsPaused() view returns(bool)",
    "function isInsolvent() view returns(bool)"
  ], provider);
  const adapter = new ethers.Contract(adapterRecord.address, [
    "function asset() view returns(address)", "function vault() view returns(address)",
    "function totalManagedAssets() view returns(uint256)"
  ], provider);
  const vaultValues = await Promise.all([
    vault.owner(), vault.pauseAdmin(), vault.strategyAdmin(), vault.asset(), vault.strategy(), vault.depositCap(),
    vault.strategyCap(), vault.maxLossBps(), vault.strategyDebt(), vault.accountedAssets(), vault.depositsPaused(),
    vault.allocationsPaused(), vault.isInsolvent(), adapter.asset(), adapter.vault(), adapter.totalManagedAssets()
  ]);
  if (!same(vaultValues[0], deployment.contracts.timelock.address)) {
    throw new Error("Vault ownership is not held by the timelock.");
  }
  if (!same(vaultValues[1], deployment.riskAdmin) || !same(vaultValues[2], deployment.riskAdmin)) {
    throw new Error("Vault testnet operational roles do not match the risk administrator.");
  }
  validateVaultDeploymentRecord(deployment, {
    owner: vaultValues[0], pauseAdmin: vaultValues[1], strategyAdmin: vaultValues[2], asset: vaultValues[3],
    strategy: vaultValues[4], depositCap: vaultValues[5], strategyCap: vaultValues[6], maxLossBps: vaultValues[7],
    strategyDebt: vaultValues[8], accountedAssets: vaultValues[9], depositsPaused: vaultValues[10],
    allocationsPaused: vaultValues[11], insolvent: vaultValues[12], adapterAsset: vaultValues[13],
    adapterVault: vaultValues[14], adapterManagedAssets: vaultValues[15]
  });

  const registry = new ethers.Contract(deployment.contracts.dexRegistry.address, [
    "function owner() view returns(address)", "function pauseAdmin() view returns(address)",
    "function dexCount() view returns(uint256)", "function dexIdAt(uint256) view returns(bytes32)",
    "function getDex(bytes32) view returns(address adapter,bool enabled,uint32 priority)"
  ], provider);
  const risk = new ethers.Contract(deployment.contracts.riskRegistry.address, [
    "function owner() view returns(address)", "function riskAdmin() view returns(address)",
    "function pauseAdmin() view returns(address)", "function executor() view returns(address)", "function swapsPaused() view returns(bool)"
  ], provider);
  const [registryOwner, registryPauseAdmin, dexCount, riskOwner, riskAdmin, riskPauseAdmin, executor, swapsPaused] = await Promise.all([
    registry.owner(), registry.pauseAdmin(), registry.dexCount(), risk.owner(), risk.riskAdmin(), risk.pauseAdmin(), risk.executor(), risk.swapsPaused()
  ]);
  const timelock = deployment.contracts.timelock.address, emergency = deployment.contracts.emergencyController.address;
  if (!same(registryOwner, timelock) || !same(riskOwner, timelock)) throw new Error("Registry ownership is not held by the timelock.");
  if (!same(registryPauseAdmin, emergency) || !same(riskPauseAdmin, emergency)) throw new Error("Emergency pause authority mismatch.");
  if (!same(executor, deployment.contracts.executionRouter.address)) throw new Error("Risk executor mismatch.");
  validateRiskAdministrator(deployment, riskAdmin);

  const onchainDexes = await Promise.all(Array.from({ length: Number(dexCount) }, async (_, index) => {
    const id = await registry.dexIdAt(index);
    const [adapter, enabled, priority] = await registry.getDex(id);
    return { id, adapter, enabled, priority: Number(priority) };
  }));
  validateDeploymentDexRecords(deployment.dexes, onchainDexes);
  await assertContractCode(provider, Object.fromEntries(onchainDexes.map((dex, index) => [
    `lqc.dexAdapter.${deployment.dexes[index].name || index}`, dex.adapter
  ])));

  const v3Record = deployment.dexes.find(dex => dex.kind === "v3");
  if (v3Record) {
    validateV3DeploymentRecord(v3Record);
    await assertPancakeV3PoolsExist(provider, v3Record.pools);
    const v3Adapter = new ethers.Contract(v3Record.adapter, [
      "function maxHops() view returns(uint256)",
      "function allowedFeeTiers(uint24) view returns(bool)",
      "function allowedPools(bytes32) view returns(bool)",
      "function poolKey(address,address,uint24) pure returns(bytes32)"
    ], provider);
    const onchainMaxHops = Number(await v3Adapter.maxHops());
    if (onchainMaxHops !== v3Record.maxHops) throw new Error("PancakeSwap V3 max-hop configuration mismatch.");
    for (const fee of [100, 500, 2500, 10000]) {
      if (await v3Adapter.allowedFeeTiers(fee) !== v3Record.feeTiers.includes(fee)) {
        throw new Error(`PancakeSwap V3 fee-tier ${fee} configuration mismatch.`);
      }
    }
    for (const pool of v3Record.pools) {
      const key = await v3Adapter.poolKey(pool.tokenA, pool.tokenB, Number(pool.fee));
      if (!await v3Adapter.allowedPools(key)) throw new Error("PancakeSwap V3 reviewed pool is not allowlisted on-chain.");
    }
  }

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
      riskAdmin,
      timelockDelaySeconds: Number(delay),
      vaultReady: true,
      evidenceContractCount: evidence.contractCount
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
