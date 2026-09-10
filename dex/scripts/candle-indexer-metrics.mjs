import crypto from 'node:crypto';

const DEFINITIONS=Object.freeze({
  candle_requests_total:['counter','Candle API requests received.'],candle_rate_limited_total:['counter','Candle API requests rejected by the client rate limit.'],candle_overload_total:['counter','Candle API requests rejected by the concurrency limit.'],candle_cache_hits_total:['counter','Signed candle response cache hits.'],candle_cache_misses_total:['counter','Signed candle response cache misses.'],candle_not_modified_total:['counter','Candle API 304 responses.'],candle_responses_signed_total:['counter','New signed candle responses.'],http_errors_total:['counter','HTTP requests ending in handled errors.'],sync_success_total:['counter','Successful indexer synchronization cycles.'],sync_failure_total:['counter','Failed indexer synchronization cycles.'],reorg_recovery_total:['counter','Finalized chain reorg recoveries.'],active_candle_requests:['gauge','Candle responses currently being built.'],indexed_cursor:['gauge','Next block cursor to index.'],finalized_head:['gauge','Latest independently verified finalized block.'],indexer_lag_blocks:['gauge','Blocks between the indexed cursor and finalized head.'],rpc_sources_configured:['gauge','Configured RPC source count.'],rpc_sources_healthy:['gauge','Healthy RPC source count.']
});

export class IndexerMetrics{
  constructor(){this.values=new Map(Object.keys(DEFINITIONS).map(name=>[name,0]))}
  increment(name,amount=1){this.#assert(name,amount);this.values.set(name,this.values.get(name)+amount)}
  set(name,value){this.#assert(name,value);this.values.set(name,value)}
  get(name){if(!DEFINITIONS[name])throw new Error('Unknown indexer metric.');return this.values.get(name)}
  render(){const lines=[];for(const [name,[type,help]] of Object.entries(DEFINITIONS)){lines.push(`# HELP lqc_${name} ${help}`,`# TYPE lqc_${name} ${type}`,`lqc_${name} ${this.values.get(name)}`)}return`${lines.join('\n')}\n`}
  #assert(name,value){if(!DEFINITIONS[name]||!Number.isFinite(value)||value<0)throw new Error('Indexer metric update is invalid.')}
}

export function metricsAuthorized(header,token){
  if(typeof token!=='string'||token.length<32)return false;const expected=Buffer.from(`Bearer ${token}`),actual=Buffer.from(String(header||''));return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
