import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

export async function preflightLendingStage0Feeds({ providers, manifest, deployer }) {
  const { manifestDigest, ...body } = manifest;
  if (canonicalDigest(body) !== manifestDigest || manifest.stage !== "stage0-four-independent-testnet-feeds" || manifest.orderedActions?.length !== 4) throw new Error("Invalid Stage-0 manifest");
  if (!ethers.isAddress(deployer) || !Array.isArray(providers) || providers.length < 2) throw new Error("Use a valid deployer and 2+ BSC testnet RPCs");
  const heads = await Promise.all(providers.map(async p => { if (Number((await p.getNetwork()).chainId) !== 97) throw new Error("Stage-0 RPC chain mismatch"); return p.getBlockNumber(); }));
  const blockNumber = Math.min(...heads);
  const observations = await Promise.all(providers.map(async p => {
    const block = await p.getBlock(blockNumber); if (!block?.hash || block.baseFeePerGas == null) throw new Error("Canonical block missing");
    const [nonce, balance, feeData] = await Promise.all([p.getTransactionCount(deployer, blockNumber), p.getBalance(deployer, blockNumber), p.getFeeData()]);
    if (feeData?.gasPrice == null || feeData.gasPrice <= 0n) throw new Error("Canonical gas price missing");
    const addresses = manifest.orderedActions.map((_, i) => ethers.getCreateAddress({ from: deployer, nonce: BigInt(nonce) + BigInt(i) }));
    const [codes, gas] = await Promise.all([Promise.all(addresses.map(a => p.getCode(a, blockNumber))), Promise.all(manifest.orderedActions.map(a => p.estimateGas({ from: deployer, data: a.data, value: 0 }))) ]);
    if (codes.some(code => code !== "0x")) throw new Error("Predicted Stage-0 address already has code");
    return { blockHash: block.hash.toLowerCase(), baseFeePerGas: String(block.baseFeePerGas), gasPrice: String(feeData.gasPrice), nonce: String(nonce), balance: String(balance), addresses, gas: gas.map(String) };
  }));
  const first = observations[0];
  for (const current of observations.slice(1)) {
    if (current.blockHash !== first.blockHash || current.baseFeePerGas !== first.baseFeePerGas || current.nonce !== first.nonce || current.balance !== first.balance || canonicalDigest(current.addresses) !== canonicalDigest(first.addresses)) throw new Error("Stage-0 RPC state disagreement");
    current.gas.forEach((value, i) => { const a = BigInt(first.gas[i]), b = BigInt(value), high = a > b ? a : b, low = a > b ? b : a; if ((high - low) * 100n > high * 5n) throw new Error("Stage-0 gas estimate disagreement"); });
  }
  const gas = first.gas.map((_, i) => observations.reduce((m, o) => BigInt(o.gas[i]) > m ? BigInt(o.gas[i]) : m, 0n));
  const totalGas = gas.reduce((a, b) => a + b, 0n), conservativeGasPrice = observations.reduce((max, current) => BigInt(current.gasPrice) > max ? BigInt(current.gasPrice) : max, 0n), requiredGasBudget = totalGas * conservativeGasPrice * 120n / 100n;
  if (BigInt(first.balance) < requiredGasBudget) throw new Error("Insufficient tBNB for four feed deployments");
  const result = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE0_MULTI_RPC_PREFLIGHT", status: "PREFLIGHT_VERIFIED_FOR_REVIEW", network: manifest.network, manifestDigest, deployer: ethers.getAddress(deployer), blockNumber, blockHash: first.blockHash, deployerNonce: first.nonce, deployerBalance: first.balance, rpcCount: providers.length, conservativeGasPrice: conservativeGasPrice.toString(), deployments: manifest.orderedActions.map((a, i) => ({ id: a.id, asset: a.asset, role: a.role, predictedAddress: first.addresses[i], initialAnswer: a.initialAnswer, conservativeGas: gas[i].toString() })), totalConservativeGas: totalGas.toString(), requiredGasBudget: requiredGasBudget.toString(), transactionOccurred: false, safety: "Read-only preflight; no signing or transaction broadcast." };
  return { ...result, preflightDigest: canonicalDigest(result) };
}

async function main() {
  const [manifestFile, deployer, outputFile] = process.argv.slice(2), urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!manifestFile || !deployer || urls.length < 2) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <manifest.json> <deployer> [output.json]");
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestFile))), result = await preflightLendingStage0Feeds({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), manifest, deployer });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
