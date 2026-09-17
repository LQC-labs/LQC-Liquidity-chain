import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

const feedI = new ethers.Interface(["function owner() view returns(address)", "function decimals() view returns(uint8)", "function answer() view returns(int256)", "function updatedAt() view returns(uint256)", "function roundId() view returns(uint80)"]);
async function read(provider, address, fn, block) { return feedI.decodeFunctionResult(fn, await provider.call({ to: address, data: feedI.encodeFunctionData(fn) }, block))[0]; }

export async function verifyLendingStage0Feeds({ providers, manifest, preflight, transactionHashes, confirmations = 3 }) {
  const { manifestDigest, ...manifestBody } = manifest, { preflightDigest, ...preflightBody } = preflight;
  if (canonicalDigest(manifestBody) !== manifestDigest || canonicalDigest(preflightBody) !== preflightDigest || preflight.manifestDigest !== manifestDigest) throw new Error("Invalid Stage-0 evidence");
  if (!Array.isArray(providers) || providers.length < 2 || transactionHashes?.length !== 4 || new Set(transactionHashes.map(x => x.toLowerCase())).size !== 4) throw new Error("Use 2+ RPCs and four unique transaction hashes");
  const heads = await Promise.all(providers.map(async p => { if (Number((await p.getNetwork()).chainId) !== 97) throw new Error("Stage-0 verification chain mismatch"); return p.getBlockNumber(); }));
  const observations = await Promise.all(providers.map(async (p, rpcIndex) => {
    const deployments = [];
    for (let i = 0; i < 4; i++) {
      const [tx, receipt] = await Promise.all([p.getTransaction(transactionHashes[i]), p.getTransactionReceipt(transactionHashes[i])]);
      const expected = manifest.orderedActions[i], address = preflight.deployments[i].predictedAddress;
      if (!tx || !receipt || receipt.status !== 1 || tx.to !== null || tx.from.toLowerCase() !== preflight.deployer.toLowerCase() || tx.data.toLowerCase() !== expected.data.toLowerCase() || receipt.contractAddress?.toLowerCase() !== address.toLowerCase() || heads[rpcIndex] - receipt.blockNumber + 1 < confirmations) throw new Error("Invalid or weak-finality Stage-0 deployment");
      const block = await p.getBlock(receipt.blockNumber), code = await p.getCode(address, receipt.blockNumber);
      if (!block?.hash || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase() || code === "0x") throw new Error("Missing canonical Stage-0 runtime");
      const [owner, decimals, answer, updatedAt, roundId] = await Promise.all([read(p,address,"owner",receipt.blockNumber),read(p,address,"decimals",receipt.blockNumber),read(p,address,"answer",receipt.blockNumber),read(p,address,"updatedAt",receipt.blockNumber),read(p,address,"roundId",receipt.blockNumber)]);
      if (owner.toLowerCase() !== expected.owner.toLowerCase() || Number(decimals) !== expected.decimals || answer !== BigInt(expected.initialAnswer) || updatedAt <= 0n || roundId !== 1n) throw new Error("Stage-0 feed state mismatch");
      deployments.push({ id: expected.id, address: ethers.getAddress(address), transactionHash: transactionHashes[i].toLowerCase(), blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), runtimeDigest: sha256(code), owner: ethers.getAddress(owner), decimals: Number(decimals), answer: answer.toString(), updatedAt: updatedAt.toString(), roundId: roundId.toString() });
    }
    return deployments;
  }));
  const first = observations[0]; for (const current of observations.slice(1)) if (canonicalDigest(current) !== canonicalDigest(first)) throw new Error("Stage-0 verification RPC disagreement");
  const body = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE0_FEED_VERIFICATION", status: "VERIFIED_LENDING_STAGE0_FEEDS", network: manifest.network, manifestDigest, preflightDigest, rpcCount: providers.length, confirmations, deployments: first, transactionOccurred: true, nextStage: "Insert the four verified feed addresses into the Lending testnet configuration before Stage 1." };
  return { ...body, verificationDigest: canonicalDigest(body) };
}

async function main() {
  const [manifestFile, preflightFile, hashesCsv, outputFile] = process.argv.slice(2), urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!manifestFile || !preflightFile || !hashesCsv || urls.length < 2) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <manifest> <preflight> <tx1,tx2,tx3,tx4> [output]");
  const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file))), result = await verifyLendingStage0Feeds({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), manifest: readJson(manifestFile), preflight: readJson(preflightFile), transactionHashes: hashesCsv.split(",") });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
