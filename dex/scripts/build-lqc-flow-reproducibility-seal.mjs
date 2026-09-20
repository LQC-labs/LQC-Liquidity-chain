import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import solc from "solc";

const root = path.resolve(import.meta.dirname, "..");
const required = ["LQCFlowFactory", "LQCFlowPair", "LQCFlowRouter", "LQCFlowAdapter"];
const artifactPath = {
  LQCFlowFactory: "artifacts/contracts/LQCFlowFactory.sol/LQCFlowFactory.json",
  LQCFlowPair: "artifacts/contracts/LQCFlowPair.sol/LQCFlowPair.json",
  LQCFlowRouter: "artifacts/contracts/LQCFlowRouter.sol/LQCFlowRouter.json",
  LQCFlowAdapter: "artifacts/contracts/router-v2/adapters/LQCFlowAdapter.sol/LQCFlowAdapter.json"
};
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const contracts = {};
for (const name of required) {
  const a = read(artifactPath[name]);
  if (!a.bytecode || !a.deployedBytecode) throw new Error(`Missing bytecode for ${name}`);
  contracts[name] = {
    sourceName: a.sourceName,
    creationBytecodeHash: ethers.keccak256(a.bytecode),
    runtimeBytecodeHash: ethers.keccak256(a.deployedBytecode)
  };
}
const seal = {
  schema: "lqc-flow-reproducibility-seal/v1",
  status: "PRE_DEPLOYMENT_ONLY",
  sourceCommit: process.env.GITHUB_SHA || process.env.SOURCE_COMMIT || "LOCAL_UNPINNED",
  compiler: { name: "solc", version: solc.version() },
  compilerSettings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai" },
  target: { network: "BSC Testnet", chainId: 97 },
  contracts,
  deploymentEvidenceRequired: {
    constructorArguments: true,
    deployerOrGovernanceIdentity: true,
    transactionHash: true,
    blockNumber: true,
    contractAddress: true
  },
  safety: "No RPC call, wallet, signature, transaction or deployment is performed by this gate."
};
const out = path.join(root, "evidence", "master2-lqc-flow-reproducibility-seal.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(seal, null, 2) + "\n");
console.log(JSON.stringify(seal, null, 2));
