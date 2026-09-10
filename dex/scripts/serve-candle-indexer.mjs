import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ethers } from "ethers";
import { aggregateCandles, approvedPool, swapToTrade, TIMEFRAME_SECONDS } from "./candle-indexer-core.mjs";
import { indexerHealth } from "./candle-indexer-health.mjs";
import { clientAddress, FixedWindowRateLimiter, TtlCache } from "./candle-indexer-http.mjs";
import { IndexerMetrics, metricsAuthorized } from "./candle-indexer-metrics.mjs";
import { signCandlePayload } from "./candle-indexer-proof.mjs";
import { appendFinalizedAnchor, detectReorg, rollbackTrades } from "./candle-indexer-reorg.mjs";
import { selectCanonicalProvider } from "./candle-indexer-rpc.mjs";
import { indexerSnapshot, loadIndexerState, saveIndexerState } from "./candle-indexer-store.mjs";

const root = path.resolve(import.meta.dirname, "..");
const deploymentFile = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
if (!rpcUrl) throw new Error("BSC_TESTNET_RPC_URL is required.");
const signingKey=process.env.CANDLE_SIGNING_PRIVATE_KEY;
if(!signingKey)throw new Error("CANDLE_SIGNING_PRIVATE_KEY is required and must never be committed.");
if (!fs.existsSync(deploymentFile)) throw new Error("DEPLOYMENT_FILE must point to a completed deployment record.");
const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
if (Number(deployment?.network?.chainId) !== 97) throw new Error("Candle indexer only accepts BSC testnet chain 97.");
const stateFile = path.resolve(process.env.INDEXER_STATE_FILE || path.join(root, ".data/candle-indexer-97.json"));
const pools = deployment.pools || [];
if (!pools.length || pools.some(pool => !ethers.isAddress(pool.address))) throw new Error("Deployment record has no valid approved pools.");

function setting(name,fallback,minimum){const value=Number(process.env[name]||fallback);if(!Number.isInteger(value)||value<minimum)throw new Error(`${name} must be an integer of at least ${minimum}.`);return value}
const pollMs=setting('POLL_MS',6000,3000),confirmations=setting('FINALITY_BLOCKS',12,2),maxStaleMs=setting('MAX_STALE_MS',pollMs*4,30000),maxLagBlocks=setting('MAX_LAG_BLOCKS',2000,0);
const requestsPerMinute=setting('CANDLE_REQUESTS_PER_MINUTE',120,1),maxConcurrent=setting('CANDLE_MAX_CONCURRENT',32,1),cacheMs=setting('CANDLE_CACHE_MS',3000,250),trustProxy=process.env.TRUST_PROXY==='1';
if(requestsPerMinute>10000||maxConcurrent>256||cacheMs>10000)throw new Error('Candle HTTP limits exceed the safe maximum.');
const metricsToken=String(process.env.METRICS_BEARER_TOKEN||'');if(metricsToken&&metricsToken.length<32)throw new Error('METRICS_BEARER_TOKEN must contain at least 32 characters.');
const rpcUrls=[rpcUrl,...String(process.env.BSC_TESTNET_RPC_URLS||'').split(',')].map(value=>value.trim()).filter((value,index,all)=>value&&all.indexOf(value)===index);
const providers=rpcUrls.map(url=>new ethers.JsonRpcProvider(url));
let rpcSelection=await selectCanonicalProvider(providers,confirmations),provider=rpcSelection.provider;
const candleSigner=new ethers.Wallet(signingKey);
if(deployment.ui?.candleSignerAddress&&ethers.getAddress(deployment.ui.candleSignerAddress)!==candleSigner.address)throw new Error("Candle signing key does not match the deployment signer address.");
const corsOrigin = String(process.env.CORS_ORIGIN || "").trim();
if (corsOrigin === "*") throw new Error("CORS_ORIGIN must name the exact approved UI origin.");
const headers = cache => ({ "content-type": "application/json; charset=utf-8", "cache-control": cache,
  "x-content-type-options":"nosniff",
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
const dataFile=path.resolve(process.env.INDEXER_DATA_FILE||path.join(root,'.indexer/candles-97.json'));
const restored=loadIndexerState(dataFile,{chainId:97,pools:state.values()});
if(restored)for(const [address,trades] of restored.trades)state.get(address).trades=trades;

async function timestamp(blockNumber) {
  if (!blockTimes.has(blockNumber)) blockTimes.set(blockNumber, provider.getBlock(blockNumber).then(block => Number(block.timestamp)));
  return blockTimes.get(blockNumber);
}
let cursor = restored?.cursor||Math.max(0, Number(process.env.START_BLOCK || 0));
let floorBlock=restored?.floorBlock??cursor,anchors=restored?.anchors||[];
const startedAt=Date.now();let syncing=false,lastSuccessfulSyncAt=null,lastErrorAt=null,lastHead=null,reorgCount=0,lastReorgAt=null;
const requestLimiter=new FixedWindowRateLimiter({limit:requestsPerMinute}),responseCache=new TtlCache({ttlMs:cacheMs});let activeCandleRequests=0;
const metrics=new IndexerMetrics();metrics.set('rpc_sources_configured',rpcSelection.configuredSources);metrics.set('rpc_sources_healthy',rpcSelection.healthySources);
async function sync() {
  rpcSelection=await selectCanonicalProvider(providers,confirmations);provider=rpcSelection.provider;const head=rpcSelection.head,latest = head - confirmations;lastHead=head;metrics.set('rpc_sources_healthy',rpcSelection.healthySources);metrics.set('finalized_head',Math.max(0,latest));
  if (latest < 0) return;
  if (!cursor) {cursor = Math.max(0, latest - Number(process.env.WARMUP_BLOCKS || 10000));floorBlock=cursor;}
  const reorg=await detectReorg(anchors,blockNumber=>provider.getBlock(blockNumber),floorBlock);
  if(reorg.reorg){cursor=reorg.rewindBlock;anchors=reorg.anchors;reorgCount++;metrics.increment('reorg_recovery_total');lastReorgAt=Date.now();for(const pool of state.values())pool.trades=rollbackTrades(pool.trades,cursor);for(const blockNumber of blockTimes.keys())if(blockNumber>=cursor)blockTimes.delete(blockNumber);saveIndexerState(dataFile,indexerSnapshot(97,cursor,state.values(),{floorBlock,anchors}));console.warn(`Finalized chain reorg detected; rewinding candle indexer to block ${cursor}.`)}
  while (cursor <= latest) {
    const toBlock = Math.min(latest, cursor + 1999),batch=new Map([...state.keys()].map(address=>[address,[]]));
    for (const pool of state.values()) {
      const logs = await provider.getLogs({ address: pool.address, topics: [swapTopic], fromBlock: cursor, toBlock });
      for (const log of logs) {
        const args = iface.parseLog(log).args, time = await timestamp(log.blockNumber);
        for (const [base, quote, baseDecimals, quoteDecimals] of [[pool.token0, pool.token1, pool.decimals0, pool.decimals1], [pool.token1, pool.token0, pool.decimals1, pool.decimals0]]) {
          batch.get(pool.address.toLowerCase()).push({ base: base.toLowerCase(), quote: quote.toLowerCase(), blockNumber:Number(log.blockNumber),transactionHash:log.transactionHash,logIndex:Number(log.index??log.logIndex), ...swapToTrade(args, { token0: pool.token0, base, baseDecimals, quoteDecimals }, time) });
        }
      }
    }
    const finalizedBlock=await provider.getBlock(toBlock);anchors=appendFinalizedAnchor(anchors,finalizedBlock);cursor = toBlock + 1;
    for(const pool of state.values()){pool.trades.push(...batch.get(pool.address.toLowerCase()));if(pool.trades.length>200000)pool.trades.splice(0,pool.trades.length-200000)}
    saveIndexerState(dataFile,indexerSnapshot(97,cursor,state.values(),{floorBlock,anchors}));metrics.set('indexed_cursor',cursor);metrics.set('indexer_lag_blocks',Math.max(0,latest-(cursor-1)));
  }
}

async function guardedSync() { if (syncing) return; syncing = true; try { await sync();lastSuccessfulSyncAt=Date.now();metrics.increment('sync_success_total'); } catch (error) { lastErrorAt=Date.now();metrics.increment('sync_failure_total');console.error("Indexer sync failed:", error.message); } finally { syncing = false; } }
await guardedSync();
setInterval(guardedSync,pollMs).unref();

const server = http.createServer(async(request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if(request.method==='GET'&&url.pathname==='/metrics'){if(!metricsToken){response.writeHead(404,headers('no-store'));response.end(JSON.stringify({error:'Not found.'}));return}if(!metricsAuthorized(request.headers.authorization,metricsToken)){response.writeHead(401,{...headers('no-store'),'www-authenticate':'Bearer'});response.end(JSON.stringify({error:'Unauthorized.'}));return}metrics.set('active_candle_requests',activeCandleRequests);metrics.set('indexed_cursor',cursor);metrics.set('rpc_sources_healthy',rpcSelection.healthySources);response.writeHead(200,{'content-type':'text/plain; version=0.0.4; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(metrics.render());return}
    if(request.method==='GET'&&(url.pathname==='/health'||url.pathname==='/ready')){const health=indexerHealth({startedAt,lastSuccessfulSyncAt,lastErrorAt,cursor,head:lastHead,confirmations,syncing,reorgCount,lastReorgAt,maxStaleMs,maxLagBlocks,rpcConfigured:rpcSelection.configuredSources,rpcHealthy:rpcSelection.healthySources,independentRpcVerified:rpcSelection.independentVerified});response.writeHead(url.pathname==='/ready'&&!health.ready?503:200,headers('no-store'));response.end(JSON.stringify(health));return;}
    if (request.method !== "GET" || url.pathname !== "/candles") throw new Error("Not found.");
    metrics.increment('candle_requests_total');const rate=requestLimiter.consume(clientAddress(request,{trustProxy}));if(!rate.allowed){metrics.increment('candle_rate_limited_total');response.writeHead(429,{...headers('no-store'),'retry-after':String(rate.retryAfterSeconds)});response.end(JSON.stringify({error:'Too many candle requests.'}));return}
    const chainId = Number(url.searchParams.get("chainId")), timeframe = url.searchParams.get("timeframe"), base = String(url.searchParams.get("base") || "").toLowerCase(), quote = String(url.searchParams.get("quote") || "").toLowerCase(), limit = Math.min(300, Math.max(20, Number(url.searchParams.get("limit")) || 120));
    if (chainId !== 97 || !TIMEFRAME_SECONDS[timeframe] || !ethers.isAddress(base) || !ethers.isAddress(quote)) throw new Error("Invalid candle query.");
    const pool = [...state.values()].find(item => approvedPool(deployment, item.address) && [item.token0.toLowerCase(), item.token1.toLowerCase()].includes(base) && [item.token0.toLowerCase(), item.token1.toLowerCase()].includes(quote) && base !== quote);
    if (!pool) throw new Error("Pair is not an approved deployment pool.");
    const cacheKey=[chainId,base,quote,timeframe,limit,cursor].join(':');let cached=responseCache.get(cacheKey);
    if(cached)metrics.increment('candle_cache_hits_total');else{metrics.increment('candle_cache_misses_total');if(activeCandleRequests>=maxConcurrent){metrics.increment('candle_overload_total');response.writeHead(503,{...headers('no-store'),'retry-after':'1'});response.end(JSON.stringify({error:'Candle service is busy.'}));return}activeCandleRequests++;metrics.set('active_candle_requests',activeCandleRequests);try{const candles = aggregateCandles(pool.trades.filter(trade => trade.base === base && trade.quote === quote), timeframe).slice(-limit),issuedAt=Math.floor(Date.now()/1000),payload=await signCandlePayload({chainId:97,base,quote,timeframe,candles,issuedAt,expiresAt:issuedAt+30,cursor,finalizedBlock:Math.max(0,cursor-1)},candleSigner);cached={body:JSON.stringify(payload),etag:`\"${payload.proof.digest}\"`};responseCache.set(cacheKey,cached);metrics.increment('candle_responses_signed_total')}finally{activeCandleRequests--;metrics.set('active_candle_requests',activeCandleRequests)}}
    if(request.headers['if-none-match']===cached.etag){metrics.increment('candle_not_modified_total');response.writeHead(304,{...headers('public, max-age=3'),etag:cached.etag});response.end();return}
    response.writeHead(200,{...headers("public, max-age=3"),etag:cached.etag,'x-ratelimit-remaining':String(rate.remaining)});response.end(cached.body);
  } catch (error) {
    metrics.increment('http_errors_total');
    response.writeHead(error.message === "Not found." ? 404 : 400, headers("no-store"));
    response.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(Number(process.env.PORT || 8787), "127.0.0.1", () => console.log("LQC candle indexer listening on 127.0.0.1:" + (process.env.PORT || 8787)));
