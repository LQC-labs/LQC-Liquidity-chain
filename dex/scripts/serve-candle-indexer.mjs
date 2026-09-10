import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ethers } from "ethers";
import { aggregateCandles, approvedPool, createIndexerCheckpoint, restoreIndexerCheckpoint, swapToTrade, TIMEFRAME_SECONDS } from "./candle-indexer-core.mjs";

const root = path.resolve(import.meta.dirname, "..");
const deploymentFile = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
if (!rpcUrl) throw new Error("BSC_TESTNET_RPC_URL is required.");
if (!fs.existsSync(deploymentFile)) throw new Error("DEPLOYMENT_FILE must point to a completed deployment record.");
const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
if (Number(deployment?.network?.chainId) !== 97) throw new Error("Candle indexer only accepts BSC testnet chain 97.");
const stateFile = path.resolve(process.env.INDEXER_STATE_FILE || path.join(root, ".data/candle-indexer-97.json"));
const pools = deployment.pools || [];
if (!pools.length || pools.some(pool => !ethers.isAddress(pool.address))) throw new Error("Deployment record has no valid approved pools.");

const provider = new ethers.JsonRpcProvider(rpcUrl, 97, { staticNetwork: true });
const corsOrigin = String(process.env.CORS_ORIGIN || "").trim();
if (corsOrigin === "*") throw new Error("CORS_ORIGIN must name the exact approved UI origin.");
const headers = cache => ({ "content-type": "application/json; charset=utf-8", "cache-control": cache,
  ...(corsOrigin ? { "access-control-allow-origin": corsOrigin, vary: "origin" } : {}) });
const pairAbi = ["function token0() view returns(address)", "function token1() view returns(address)",
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)"];
const tokenAbi = ["function decimals() view returns(uint8)"];
const iface = new ethers.Interface(pairAbi), swapTopic = iface.getEvent("Swap").topicHash;
const state = new Map(), blockTimes = new Map();
for (const item of pools) {
  const address = ethers.getAddress(item.address), pair = new ethers.Contract(address, pairAbi, provider);
  const [token0, token1] = await Promise.all([pair.token0(), pair.token1()]);
  const [decimals0, decimals1] = await Promise.all([new ethers.Contract(token0, tokenAbi, provider).decimals(), new ethers.Contract(token1, tokenAbi, provider).decimals()]);
  state.set(address.toLowerCase(), { address, token0, token1, decimals0: Number(decimals0), decimals1: Number(decimals1), trades: [] });
}

async function timestamp(blockNumber) {
  if (!blockTimes.has(blockNumber)) blockTimes.set(blockNumber, provider.getBlock(blockNumber).then(block => Number(block.timestamp)));
  return blockTimes.get(blockNumber);
}
let cursor = Math.max(0, Number(process.env.START_BLOCK || 0));
if (fs.existsSync(stateFile)) cursor = restoreIndexerCheckpoint(JSON.parse(fs.readFileSync(stateFile, "utf8")), state.values());
function persistCheckpoint() {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(createIndexerCheckpoint(cursor, state.values())));
  fs.renameSync(temporary, stateFile);
}
async function sync() {
  const head = await provider.getBlockNumber(), confirmations = Math.max(2, Number(process.env.FINALITY_BLOCKS || 12)), latest = head - confirmations;
  if (latest < 0) return;
  if (!cursor) cursor = Math.max(0, latest - Number(process.env.WARMUP_BLOCKS || 10000));
  while (cursor <= latest) {
    const toBlock = Math.min(latest, cursor + 1999);
    for (const pool of state.values()) {
      const logs = await provider.getLogs({ address: pool.address, topics: [swapTopic], fromBlock: cursor, toBlock });
      for (const log of logs) {
        const args = iface.parseLog(log).args, time = await timestamp(log.blockNumber);
        for (const [base, quote, baseDecimals, quoteDecimals] of [[pool.token0, pool.token1, pool.decimals0, pool.decimals1], [pool.token1, pool.token0, pool.decimals1, pool.decimals0]]) {
          pool.trades.push({ base: base.toLowerCase(), quote: quote.toLowerCase(), ...swapToTrade(args, { token0: pool.token0, base, baseDecimals, quoteDecimals }, time) });
        }
      }
      if (pool.trades.length > 200000) pool.trades.splice(0, pool.trades.length - 200000);
    }
    cursor = toBlock + 1;
    persistCheckpoint();
  }
}

let syncing = false;
async function guardedSync() { if (syncing) return; syncing = true; try { await sync(); } catch (error) { console.error("Indexer sync failed:", error.message); } finally { syncing = false; } }
await guardedSync();
setInterval(guardedSync, Math.max(3000, Number(process.env.POLL_MS || 6000))).unref();

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, "http://localhost"), chainId = Number(url.searchParams.get("chainId")), timeframe = url.searchParams.get("timeframe"), base = String(url.searchParams.get("base") || "").toLowerCase(), quote = String(url.searchParams.get("quote") || "").toLowerCase(), limit = Math.min(300, Math.max(20, Number(url.searchParams.get("limit")) || 120));
    if (request.method !== "GET" || url.pathname !== "/candles") throw new Error("Not found.");
    if (chainId !== 97 || !TIMEFRAME_SECONDS[timeframe] || !ethers.isAddress(base) || !ethers.isAddress(quote)) throw new Error("Invalid candle query.");
    const pool = [...state.values()].find(item => approvedPool(deployment, item.address) && [item.token0.toLowerCase(), item.token1.toLowerCase()].includes(base) && [item.token0.toLowerCase(), item.token1.toLowerCase()].includes(quote) && base !== quote);
    if (!pool) throw new Error("Pair is not an approved deployment pool.");
    const candles = aggregateCandles(pool.trades.filter(trade => trade.base === base && trade.quote === quote), timeframe).slice(-limit);
    response.writeHead(200, headers("public, max-age=3"));
    response.end(JSON.stringify({ chainId: 97, base, quote, timeframe, candles }));
  } catch (error) {
    response.writeHead(error.message === "Not found." ? 404 : 400, headers("no-store"));
    response.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(Number(process.env.PORT || 8787), "127.0.0.1", () => console.log("LQC candle indexer listening on 127.0.0.1:" + (process.env.PORT || 8787)));
