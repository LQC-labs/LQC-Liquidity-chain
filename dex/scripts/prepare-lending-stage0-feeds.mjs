import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

export const LENDING_STAGE0_DEFAULTS = Object.freeze({
  chainId: 97,
  governanceSafe: "0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A",
  collateralAsset: "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc",
  debtAsset: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  decimals: 8,
  feeds: [
    { id: "collateral-primary", asset: "tLQC", role: "primary", initialAnswer: "100000000" },
    { id: "collateral-secondary", asset: "tLQC", role: "secondary", initialAnswer: "99000000" },
    { id: "debt-primary", asset: "WBNB", role: "primary", initialAnswer: "60000000000" },
    { id: "debt-secondary", asset: "WBNB", role: "secondary", initialAnswer: "59400000000" }
  ]
});

export async function buildLendingStage0FeedManifest({ artifact, config = LENDING_STAGE0_DEFAULTS }) {
  if (config.chainId !== 97 || !ethers.isAddress(config.governanceSafe) || !ethers.isAddress(config.collateralAsset) || !ethers.isAddress(config.debtAsset)) throw new Error("Invalid Lending Stage-0 configuration");
  if (config.collateralAsset.toLowerCase() === config.debtAsset.toLowerCase() || config.feeds?.length !== 4) throw new Error("Stage-0 requires distinct assets and four feeds");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
  const orderedActions = await Promise.all(config.feeds.map(async (feed, index) => {
    if (!/^\d+$/.test(feed.initialAnswer) || BigInt(feed.initialAnswer) <= 0n) throw new Error("Feed answer must be positive");
    const tx = await factory.getDeployTransaction(config.governanceSafe, config.decimals, BigInt(feed.initialAnswer));
    return { id: index + 1, action: "deploy-testnet-price-feed", ...feed, owner: ethers.getAddress(config.governanceSafe), decimals: config.decimals, data: tx.data, initCodeDigest: sha256(tx.data), value: "0" };
  }));
  const body = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE0_FEED_DEPLOYMENT", stage: "stage0-four-independent-testnet-feeds", status: "REVIEW_REQUIRED", network: { name: "BSC Testnet", chainId: 97 }, market: { collateralAsset: ethers.getAddress(config.collateralAsset), debtAsset: ethers.getAddress(config.debtAsset), collateralSymbol: "tLQC", debtSymbol: "WBNB" }, governanceSafe: ethers.getAddress(config.governanceSafe), orderedActions, transactionOccurred: false, safety: "Preparation only. No key, signature, approval, deployment, token movement, or transaction broadcast." };
  return { ...body, manifestDigest: canonicalDigest(body) };
}

async function main() {
  const [outputFile] = process.argv.slice(2);
  const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/lending/LQCTestnetPriceFeed.sol/LQCTestnetPriceFeed.json", import.meta.url)));
  const result = await buildLendingStage0FeedManifest({ artifact });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
