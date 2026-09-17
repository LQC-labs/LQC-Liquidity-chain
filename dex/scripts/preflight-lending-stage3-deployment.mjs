import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

const registryInterface = new ethers.Interface(["function owner() view returns(address)", "function guardian() view returns(address)", "function oracle() view returns(address)"]);
const indexInterface = new ethers.Interface(["function owner() view returns(address)", "function rateModel() view returns(address)", "function core() view returns(address)"]);

function validateManifest(manifest) {
  const { manifestDigest, ...body } = manifest;
  const action = manifest.orderedActions?.[0];
  if (manifest?.status !== "REVIEW_REQUIRED" || manifest.network?.chainId !== 97 || manifest.stage !== "stage3-lending-core-deploy" || manifest.transactionOccurred !== false || canonicalDigest(body) !== manifestDigest || manifest.orderedActions?.length !== 1 || action.id !== 1 || action.contract !== "LQCLendingCore" || action.actor !== "deployer" || action.to !== null || action.value !== "0" || !ethers.isHexString(action.data) || action.initCodeDigest !== sha256(action.data)) throw new Error("Invalid Lending Stage-3 manifest");
}

async function readAddress(provider, target, iface, field) {
  const response = await provider.call({ to: target, data: iface.encodeFunctionData(field) });
  return ethers.getAddress(iface.decodeFunctionResult(field, response)[0]);
}

function stableObservation(value) {
  const { headBlockNumber, headBlockHash, estimatedGas, gasPrice, ...stable } = value;
  return stable;
}

export async function preflightLendingStage3AcrossRpcs({ providers, manifest, deployer }) {
  validateManifest(manifest);
  if (!ethers.isAddress(deployer) || deployer === ethers.ZeroAddress || !Array.isArray(providers) || providers.length < 2) throw new Error("Use a valid deployer and 2+ BSC testnet RPCs");
  const observations = await Promise.all(providers.map(async provider => {
    if (Number((await provider.getNetwork()).chainId) !== 97) throw new Error("Lending Stage-3 RPC chain mismatch");
    const headBlockNumber = await provider.getBlockNumber();
    const [head, feeData, nonce, balance, registryCode, indexCode, registryOwner, registryGuardian, oracle, indexOwner, rateModel, indexCore] = await Promise.all([
      provider.getBlock(headBlockNumber), provider.getFeeData(), provider.getTransactionCount(deployer, "pending"), provider.getBalance(deployer),
      provider.getCode(manifest.dependencies.marketRegistry), provider.getCode(manifest.dependencies.interestIndex),
      readAddress(provider, manifest.dependencies.marketRegistry, registryInterface, "owner"), readAddress(provider, manifest.dependencies.marketRegistry, registryInterface, "guardian"), readAddress(provider, manifest.dependencies.marketRegistry, registryInterface, "oracle"),
      readAddress(provider, manifest.dependencies.interestIndex, indexInterface, "owner"), readAddress(provider, manifest.dependencies.interestIndex, indexInterface, "rateModel"), readAddress(provider, manifest.dependencies.interestIndex, indexInterface, "core"),
    ]);
    if (!head?.hash) throw new Error("Lending Stage-3 latest block missing");
    if (registryCode === "0x" || indexCode === "0x") throw new Error("Lending Stage-3 dependency code missing");
    if (registryOwner.toLowerCase() !== manifest.roles.governanceSafe.toLowerCase() || registryGuardian.toLowerCase() !== manifest.roles.guardianSafe.toLowerCase() || oracle.toLowerCase() !== manifest.dependencies.oracleManager.toLowerCase() || indexOwner.toLowerCase() !== manifest.roles.governanceSafe.toLowerCase() || rateModel.toLowerCase() !== manifest.dependencies.interestRateModel.toLowerCase() || indexCore !== ethers.ZeroAddress) throw new Error("Lending Stage-3 dependency binding mismatch");
    const predictedAddress = ethers.getCreateAddress({ from: deployer, nonce });
    const [predictedCode, estimatedGas] = await Promise.all([provider.getCode(predictedAddress), provider.estimateGas({ from: deployer, data: manifest.orderedActions[0].data, value: 0 })]);
    if (predictedCode !== "0x") throw new Error("Predicted Lending Stage-3 address already has code");
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
    if (gasPrice === null || gasPrice <= 0n) throw new Error("Lending Stage-3 gas price unavailable");
    return { headBlockNumber, headBlockHash: head.hash.toLowerCase(), nonce: String(nonce), balance: String(balance), predictedAddress, estimatedGas: String(estimatedGas), gasPrice: String(gasPrice), dependencyRuntimeDigests: { marketRegistry: sha256(registryCode), interestIndex: sha256(indexCode) } };
  }));
  const first = observations[0];
  for (const current of observations.slice(1)) {
    if (canonicalDigest(stableObservation(current)) !== canonicalDigest(stableObservation(first))) throw new Error("Lending Stage-3 RPC state disagreement");
    const a = BigInt(first.estimatedGas), b = BigInt(current.estimatedGas), high = a > b ? a : b, low = a > b ? b : a;
    if ((high - low) * 100n > high * 5n) throw new Error("Lending Stage-3 gas estimate disagreement");
  }
  const conservativeGas = observations.reduce((max, item) => BigInt(item.estimatedGas) > max ? BigInt(item.estimatedGas) : max, 0n);
  const approvedGasLimit = conservativeGas * 120n / 100n;
  const conservativeGasPrice = observations.reduce((max, item) => BigInt(item.gasPrice) > max ? BigInt(item.gasPrice) : max, 0n);
  const requiredGasBudget = approvedGasLimit * conservativeGasPrice;
  if (BigInt(first.balance) < requiredGasBudget) throw new Error("Lending Stage-3 deployer has insufficient testnet gas balance");
  const body = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE3_MULTI_RPC_PREFLIGHT", status: "PREFLIGHT_VERIFIED_FOR_REVIEW", network: { name: "BSC Testnet", chainId: 97 }, manifestDigest: manifest.manifestDigest, stage2VerificationDigest: manifest.stage2VerificationDigest, deployer: ethers.getAddress(deployer), rpcCount: providers.length, rpcHeads: observations.map(item => ({ blockNumber: item.headBlockNumber, blockHash: item.headBlockHash })), deployerNonce: first.nonce, deployerBalance: first.balance, dependencyRuntimeDigests: first.dependencyRuntimeDigests, deployment: { contract: "LQCLendingCore", predictedAddress: first.predictedAddress, initCodeDigest: manifest.orderedActions[0].initCodeDigest, estimatedGas: conservativeGas.toString(), approvedGasLimit: approvedGasLimit.toString() }, conservativeGasPrice: conservativeGasPrice.toString(), requiredGasBudget: requiredGasBudget.toString(), transactionOccurred: false, safety: "Read-only Stage-3 preflight. No wallet, key, signature, approval, deployment, binding, market activation, token movement, or transaction." };
  return { ...body, preflightDigest: canonicalDigest(body) };
}
