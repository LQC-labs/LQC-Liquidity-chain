import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const message = error => String(error?.shortMessage || error?.message || error || "unknown").toLowerCase();
export function classifyRpcFailure(error) { const value = message(error); if (/429|too many|rate.limit/.test(value)) return "RATE_LIMITED"; if (/timeout|timed out|etimedout/.test(value)) return "TIMEOUT"; if (/chain|network/.test(value)) return "WRONG_NETWORK"; return "RPC_ERROR"; }

export async function inspectLendingRpcReadiness({ providers, labels, deployer }) {
  if (!Array.isArray(providers) || providers.length < 2 || providers.length !== labels?.length || new Set(labels).size !== labels.length || !ethers.isAddress(deployer)) throw new Error("Use 2+ distinctly labelled RPCs and a valid deployer");
  const started = Date.now(), heads = await Promise.all(providers.map(async (provider, index) => { const at = Date.now(); try { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("wrong chain"); return { index, label: labels[index], chainId: 97, head: await provider.getBlockNumber(), latencyMs: Date.now() - at }; } catch (error) { return { index, label: labels[index], error: classifyRpcFailure(error), latencyMs: Date.now() - at }; } }));
  const live = heads.filter(x => x.error === undefined), commonBlock = live.length >= 2 ? Math.min(...live.map(x => x.head)) : null;
  const results = await Promise.all(heads.map(async head => { if (head.error || commonBlock === null) return head; const provider = providers[head.index]; try { const [block, nonce, balance] = await Promise.all([provider.getBlock(commonBlock), provider.getTransactionCount(deployer, commonBlock), provider.getBalance(deployer, commonBlock)]); if (!block?.hash) throw new Error("missing canonical block"); return { label: head.label, status: "HEALTHY", chainId: 97, head: head.head, commonBlock, blockHash: block.hash.toLowerCase(), nonce: String(nonce), balance: String(balance), latencyMs: Date.now() - started }; } catch (error) { return { label: head.label, status: "UNHEALTHY", error: classifyRpcFailure(error), latencyMs: Date.now() - started }; } }));
  const healthy = results.filter(x => x.status === "HEALTHY"), first = healthy[0], agrees = healthy.length >= 2 && healthy.every(x => x.blockHash === first.blockHash && x.nonce === first.nonce && x.balance === first.balance);
  const body = { schemaVersion: 1, recordType: "LQC_LENDING_RPC_READINESS", status: agrees ? "READY_FOR_STAGE0_PREFLIGHT" : "BLOCKED_RPC_READINESS", network: { name: "BSC Testnet", chainId: 97 }, deployer: ethers.getAddress(deployer), requiredRpcCount: 2, healthyRpcCount: healthy.length, commonBlock, providers: results, checks: { twoHealthyIndependentLabels: healthy.length >= 2, canonicalStateAgreement: agrees }, transactionOccurred: false, safety: "Read-only RPC diagnostics. Endpoint paths, API keys, wallet keys, signatures and transactions are not recorded." };
  return { ...body, readinessDigest: canonicalDigest(body) };
}

async function main() { const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(x => x.trim()).filter(Boolean), deployer = process.argv[2]; if (urls.length < 2 || !deployer) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <deployer>"); const labels = urls.map((url, i) => { try { return `${new URL(url).hostname}#${i + 1}`; } catch { return `rpc-${i + 1}`; } }); console.log(JSON.stringify(await inspectLendingRpcReadiness({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), labels, deployer }), null, 2)); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
