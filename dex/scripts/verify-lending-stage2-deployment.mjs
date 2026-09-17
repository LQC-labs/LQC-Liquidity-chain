import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

const definitions = {
  LQCLendingMarketRegistry: {
    artifact: "lending/LQCLendingMarketRegistry",
    abi: ["function owner() view returns(address)", "function guardian() view returns(address)", "function oracle() view returns(address)"],
    fields: ["owner", "guardian", "oracle"],
  },
  LQCLendingInterestIndex: {
    artifact: "lending/LQCLendingInterestIndex",
    abi: ["function owner() view returns(address)", "function rateModel() view returns(address)", "function core() view returns(address)"],
    fields: ["owner", "rateModel", "core"],
  },
};

function artifact(name, source) {
  return JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../artifacts/contracts/${source}.sol/${name}.json`), "utf8"));
}

async function bindings(provider, address, definition, blockNumber) {
  const iface = new ethers.Interface(definition.abi);
  const result = {};
  for (const field of definition.fields) {
    const data = iface.encodeFunctionData(field);
    const response = await provider.call({ to: address, data }, blockNumber);
    result[field] = ethers.getAddress(iface.decodeFunctionResult(field, response)[0]);
  }
  return result;
}

function validateInputs({ providers, manifest, preflight, transactionHashes, minConfirmations }) {
  const { manifestDigest, ...manifestBody } = manifest;
  const { preflightDigest, ...preflightBody } = preflight;
  if (manifest?.status !== "REVIEW_REQUIRED" || manifest.network?.chainId !== 97 || manifest.stage !== "stage2-registry-index-deploy" || manifest.transactionOccurred !== false || canonicalDigest(manifestBody) !== manifestDigest) throw new Error("Invalid Lending Stage-2 manifest");
  if (preflight?.status !== "PREFLIGHT_VERIFIED_FOR_REVIEW" || preflight.network?.chainId !== 97 || preflight.transactionOccurred !== false || preflight.manifestDigest !== manifestDigest || canonicalDigest(preflightBody) !== preflightDigest || preflight.deployments?.length !== 2 || !ethers.isAddress(preflight.deployer)) throw new Error("Invalid Lending Stage-2 preflight");
  if (!Array.isArray(providers) || providers.length < 2 || !Number.isInteger(minConfirmations) || minConfirmations < 3) throw new Error("Use 2+ BSC testnet RPCs and at least 3 confirmations");
  if (!Array.isArray(transactionHashes) || transactionHashes.length !== 2 || new Set(transactionHashes.map(value => value.toLowerCase())).size !== 2 || transactionHashes.some(value => !ethers.isHexString(value, 32))) throw new Error("Provide two unique Lending Stage-2 transaction hashes");
}

export async function verifyLendingStage2AcrossRpcs({ providers, manifest, preflight, transactionHashes, minConfirmations = 3 }) {
  validateInputs({ providers, manifest, preflight, transactionHashes, minConfirmations });
  const heads = await Promise.all(providers.map(async provider => {
    if (Number((await provider.getNetwork()).chainId) !== 97) throw new Error("Lending Stage-2 verification chain mismatch");
    return provider.getBlockNumber();
  }));

  const observations = await Promise.all(providers.map(async (provider, rpcIndex) => Promise.all(transactionHashes.map(async (hash, index) => {
    const action = manifest.orderedActions[index];
    const expected = preflight.deployments[index];
    const definition = definitions[action.contract];
    if (!definition || expected.contract !== action.contract || expected.initCodeDigest !== action.initCodeDigest) throw new Error("Lending Stage-2 preflight manifest mismatch");
    const [transaction, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
    if (!transaction || !receipt || receipt.status !== 1) throw new Error("Lending Stage-2 transaction is missing or failed");
    if (transaction.from.toLowerCase() !== preflight.deployer.toLowerCase() || transaction.to !== null || transaction.nonce !== Number(BigInt(preflight.deployerNonce) + BigInt(index))) throw new Error("Lending Stage-2 transaction envelope mismatch");
    if (sha256(transaction.data) !== action.initCodeDigest) throw new Error("Lending Stage-2 init code mismatch");
    if (!receipt.contractAddress || receipt.contractAddress.toLowerCase() !== expected.predictedAddress.toLowerCase()) throw new Error("Lending Stage-2 deployed address mismatch");
    const block = await provider.getBlock(receipt.blockNumber);
    if (!block?.hash || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("Lending Stage-2 canonical block mismatch");
    const confirmations = heads[rpcIndex] - receipt.blockNumber + 1;
    if (confirmations < minConfirmations) throw new Error("Lending Stage-2 finality is insufficient");
    const code = await provider.getCode(receipt.contractAddress, receipt.blockNumber);
    const expectedRuntime = artifact(action.contract, definition.artifact).deployedBytecode;
    if (sha256(code) !== sha256(expectedRuntime)) throw new Error("Lending Stage-2 runtime bytecode mismatch");
    const contractBindings = await bindings(provider, receipt.contractAddress, definition, receipt.blockNumber);
    if (action.contract === "LQCLendingMarketRegistry" && (contractBindings.owner.toLowerCase() !== manifest.roles.governanceSafe.toLowerCase() || contractBindings.guardian.toLowerCase() !== manifest.roles.guardianSafe.toLowerCase() || contractBindings.oracle.toLowerCase() !== manifest.dependencies.oracleManager.toLowerCase())) throw new Error("Lending Stage-2 dependency binding mismatch");
    if (action.contract === "LQCLendingInterestIndex" && (contractBindings.owner.toLowerCase() !== manifest.roles.governanceSafe.toLowerCase() || contractBindings.rateModel.toLowerCase() !== manifest.dependencies.interestRateModel.toLowerCase() || contractBindings.core !== ethers.ZeroAddress)) throw new Error("Lending Stage-2 dependency binding mismatch");
    return { transactionHash: hash.toLowerCase(), transactionIndex: receipt.index, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), contractAddress: ethers.getAddress(receipt.contractAddress), runtimeCodeDigest: sha256(code), bindings: contractBindings, confirmations };
  }))));

  const stripConfirmations = value => { const { confirmations, ...rest } = value; return rest; };
  for (const rpc of observations.slice(1)) for (let index = 0; index < 2; index++) if (canonicalDigest(stripConfirmations(rpc[index])) !== canonicalDigest(stripConfirmations(observations[0][index]))) throw new Error("Lending Stage-2 verification RPC disagreement");
  const deployments = observations[0].map((value, index) => ({ id: manifest.orderedActions[index].id, contract: manifest.orderedActions[index].contract, initCodeDigest: manifest.orderedActions[index].initCodeDigest, ...value, confirmations: Math.min(...observations.map(rpc => rpc[index].confirmations)) }));
  const body = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE2_DEPLOYMENT_VERIFICATION", status: "VERIFIED_LENDING_STAGE2_DEPLOYMENT", network: { name: "BSC Testnet", chainId: 97 }, manifestDigest: manifest.manifestDigest, preflightDigest: preflight.preflightDigest, deployer: ethers.getAddress(preflight.deployer), startingNonce: preflight.deployerNonce, rpcCount: providers.length, minConfirmations, deployments, transactionOccurred: true, safety: "Verification only. No wallet, key, signature, approval, deployment, configuration, transfer, market activation, or transaction." };
  return { ...body, verificationDigest: canonicalDigest(body) };
}

async function main() { throw new Error("Use the exported verifier with reviewed evidence and 2+ RPC providers"); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
