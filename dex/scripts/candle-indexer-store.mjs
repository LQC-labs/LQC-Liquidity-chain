import fs from 'node:fs';
import path from 'node:path';

import { validateAnchors } from './candle-indexer-reorg.mjs';

const VERSION=2;
const transactionHash=value=>/^0x[0-9a-f]{64}$/i.test(String(value||''));
const address=value=>String(value||'').toLowerCase();
function poolIdentity(pool){return{address:address(pool.address),token0:address(pool.token0),token1:address(pool.token1),decimals0:Number(pool.decimals0),decimals1:Number(pool.decimals1)}}
function identityKey(pools){return pools.map(poolIdentity).sort((a,b)=>a.address.localeCompare(b.address))}

export function indexerSnapshot(chainId,cursor,pools,{floorBlock=0,anchors=[]}={}){
  if(!Number.isInteger(cursor)||cursor<0)throw new Error('Indexer cursor is invalid.');
  if(!Number.isInteger(floorBlock)||floorBlock<0||floorBlock>cursor)throw new Error('Indexer floor block is invalid.');
  return{version:VERSION,chainId:Number(chainId),floorBlock,cursor,anchors:validateAnchors(anchors,cursor),pools:[...pools].map(pool=>({...poolIdentity(pool),trades:pool.trades}))};
}

export function saveIndexerState(file,snapshot){
  const directory=path.dirname(file);fs.mkdirSync(directory,{recursive:true});
  const temporary=`${file}.${process.pid}.tmp`;fs.writeFileSync(temporary,JSON.stringify(snapshot),{encoding:'utf8',mode:0o600});fs.renameSync(temporary,file);
}

export function loadIndexerState(file,{chainId,pools,maxTrades=200000}){
  if(!fs.existsSync(file))return null;
  let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw new Error('Indexer checkpoint is not valid JSON.')}
  if(value?.version!==VERSION||Number(value.chainId)!==Number(chainId)||!Number.isInteger(value.floorBlock)||value.floorBlock<0||!Number.isInteger(value.cursor)||value.cursor<value.floorBlock||!Array.isArray(value.pools))throw new Error('Indexer checkpoint header is invalid.');
  const anchors=validateAnchors(value.anchors,value.cursor);
  const expected=identityKey(pools),actual=identityKey(value.pools);if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Indexer checkpoint pool identity does not match deployment.');
  const restored=new Map();for(const pool of value.pools){if(!Array.isArray(pool.trades)||pool.trades.length>maxTrades)throw new Error('Indexer checkpoint trade count is invalid.');for(const trade of pool.trades){if(!Number.isFinite(trade?.timestamp)||!Number.isFinite(trade?.price)||!Number.isFinite(trade?.baseVolume)||!Number.isFinite(trade?.quoteVolume)||trade.timestamp<=0||trade.price<=0||trade.baseVolume<0||trade.quoteVolume<0||!Number.isInteger(trade?.blockNumber)||trade.blockNumber<value.floorBlock||trade.blockNumber>=value.cursor||!transactionHash(trade.transactionHash)||!Number.isInteger(trade?.logIndex)||trade.logIndex<0)throw new Error('Indexer checkpoint contains a malformed trade.');if(![address(pool.token0),address(pool.token1)].includes(address(trade.base))||![address(pool.token0),address(pool.token1)].includes(address(trade.quote))||address(trade.base)===address(trade.quote))throw new Error('Indexer checkpoint trade pair is invalid.')}restored.set(address(pool.address),pool.trades)}
  return{floorBlock:value.floorBlock,cursor:value.cursor,anchors,trades:restored};
}
