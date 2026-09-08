import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { ethers } from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const recordPath = process.argv[2];
if (!recordPath) throw new Error("Usage: npm run prepare:verification -- <deployment-record.json>");
const deployment = JSON.parse(fs.readFileSync(path.resolve(recordPath), "utf8"));
if (Number(deployment?.network?.chainId) !== 97) throw new Error("Only BSC testnet chain 97 is supported.");

const sources = {};
function collect(dir, prefix = "contracts") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) collect(absolute, name);
    else if (entry.name.endsWith(".sol")) sources[name] = { content: fs.readFileSync(absolute, "utf8") };
  }
}
collect(path.join(root, "contracts"));

const settings = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: "shanghai",
  outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
};
const standardInput = { language: "Solidity", sources, settings };
const compilerVersion = solc.version();

const specs = [
  ["factory", "contracts/LQCFlowFactory.sol:LQCFlowFactory", ["address"], [deployment.owner]],
  ["router", "contracts/LQCFlowRouter.sol:LQCFlowRouter", ["address", "address"], [deployment.contracts.factory.address, deployment.contracts.wbnb.address]],
  ["dexRegistry", "contracts/router-v2/LQCDexRegistry.sol:LQCDexRegistry", ["address"], [deployment.deployer]],
  ["timelock", "contracts/router-v2/LQCTimelockController.sol:LQCTimelockController", ["address", "uint256"], [deployment.owner, deployment.dexRegistryOwnership.timelockDelaySeconds]],
  ["riskRegistry", "contracts/router-v2/LQCRiskRegistry.sol:LQCRiskRegistry", ["address", "address"], [deployment.deployer, deployment.owner]],
  ["emergencyController", "contracts/router-v2/LQCEmergencyController.sol:LQCEmergencyController", ["address", "address", "address"], [deployment.owner, deployment.contracts.dexRegistry.address, deployment.contracts.riskRegistry.address]],
  ["quoteRouter", "contracts/router-v2/LQCQuoteRouter.sol:LQCQuoteRouter", ["address"], [deployment.contracts.dexRegistry.address]],
  ["executionRouter", "contracts/router-v2/LQCExecutionRouter.sol:LQCExecutionRouter", ["address", "address"], [deployment.contracts.dexRegistry.address, deployment.contracts.riskRegistry.address]],
  ["nativeRouter", "contracts/router-v2/LQCNativeRouter.sol:LQCNativeRouter", ["address", "address"], [deployment.contracts.wbnb.address, deployment.contracts.executionRouter.address]],
  ["splitOptimizer", "contracts/router-v2/LQCSplitOptimizer.sol:LQCSplitOptimizer", ["address"], [deployment.contracts.dexRegistry.address]],
  ["autoRouter", "contracts/router-v2/LQCAutoRouter.sol:LQCAutoRouter", ["address", "address"], [deployment.contracts.splitOptimizer.address, deployment.contracts.executionRouter.address]],
  ["gasCostOracle", "contracts/router-v2/LQCGasCostOracle.sol:LQCGasCostOracle", ["address", "address"], [deployment.deployer, deployment.contracts.wbnb.address]],
  ["flowAdapter", "contracts/router-v2/adapters/LQCFlowAdapter.sol:LQCFlowAdapter", ["address"], [deployment.contracts.router.address]]
];

const contracts = specs.map(([key, contract, types, args]) => {
  const address = deployment?.contracts?.[key]?.address;
  if (!ethers.isAddress(address) || args.some(value => value == null)) throw new Error(`Missing verification data for ${key}.`);
  return { key, address, contract, constructorArguments: ethers.AbiCoder.defaultAbiCoder().encode(types, args).slice(2) };
});
const out = path.join(root, "verification", "bsc-testnet-97");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "standard-input.json"), JSON.stringify(standardInput, null, 2) + "\n");
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), chainId: 97, compilerVersion, sourceRevision: deployment.sourceRevision || null, contracts }, null, 2) + "\n");
console.log(`Prepared ${contracts.length} BscScan verification entries in ${out}.`);
