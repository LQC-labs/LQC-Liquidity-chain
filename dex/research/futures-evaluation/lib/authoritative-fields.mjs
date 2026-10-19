
import assert from 'node:assert/strict';
import {getAddress} from 'ethers';
import {record,dense,uint,hash32,canonical} from './input-schema.mjs';
const qty=x=>assert(typeof x==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(x),'INVALID_RPC_QUANTITY');
const data=x=>assert(typeof x==='string'&&/^0x(?:[0-9a-fA-F]{2})*$/.test(x),'INVALID_RPC_DATA');
const headerExtras=['parentHash','sha3Uncles','miner','stateRoot','transactionsRoot','receiptsRoot','logsBloom','difficulty','gasLimit','gasUsed','extraData','mixHash','nonce','baseFeePerGas','withdrawalsRoot','blobGasUsed','excessBlobGas','parentBeaconBlockRoot','requestsHash','totalDifficulty','size','uncles','withdrawals'];
export function headerMeaning(h){
 record(h,['hash','number','timestamp','transactions'],headerExtras);hash32(h.hash);qty(h.number);qty(h.timestamp);dense(h.transactions,4096);h.transactions.forEach(hash32);
 return {hash:h.hash,number:h.number,timestamp:h.timestamp,transactions:h.transactions};
}
export function validateConsumedNested(s,code){
 dense(s.contracts,19);dense(code.contracts,19);dense(s.finalViews,4096);
 for(const c of s.contracts){record(c,['role','name','address','expectedHash','rpc','blockTag','queryBlockHash','runtimeHash']);assert.equal(typeof c.role,'string');assert.equal(typeof c.name,'string');getAddress(c.address);hash32(c.runtimeHash);if(c.expectedHash!==null)hash32(c.expectedHash);}
 record(s.chain,['beforeRaw','afterRaw','unchanged']);qty(s.chain.beforeRaw);qty(s.chain.afterRaw);assert.equal(typeof s.chain.unchanged,'boolean');
 headerMeaning(s.queryHeaderBefore);headerMeaning(s.queryHeaderAfter);
 dense(s.receipts,32);
 for(const r of s.receipts){
  record(r,['label','rpc','raw','blockHeader','blockTimestamp']);assert.equal(typeof r.label,'string');assert.equal(r.rpc,'eth_getTransactionReceipt');uint(r.blockTimestamp);headerMeaning(r.blockHeader);
  const x=r.raw;record(x,['type','status','cumulativeGasUsed','logs','logsBloom','transactionHash','transactionIndex','blockHash','blockNumber','gasUsed','effectiveGasPrice','blobGasPrice','from','to','contractAddress','blockTimestamp']);
  for(const k of ['type','status','cumulativeGasUsed','transactionIndex','blockNumber','gasUsed','effectiveGasPrice'])qty(x[k]);assert(Number.isSafeInteger(x.blockTimestamp)&&x.blockTimestamp>=0,'INVALID_ANVIL_TIMESTAMP');assert.equal(String(x.blockTimestamp),r.blockTimestamp,'ANVIL_RECEIPT_TIMESTAMP_MISMATCH');
  if(x.blobGasPrice!==null)qty(x.blobGasPrice);hash32(x.transactionHash);hash32(x.blockHash);getAddress(x.from);if(x.to!==null)getAddress(x.to);if(x.contractAddress!==null)getAddress(x.contractAddress);data(x.logsBloom);assert.equal(x.logsBloom.length,514);
  dense(x.logs,4096);for(const l of x.logs){record(l,['address','topics','data','blockHash','blockNumber','blockTimestamp','transactionHash','transactionIndex','logIndex','removed']);getAddress(l.address);dense(l.topics,4);l.topics.forEach(hash32);data(l.data);hash32(l.blockHash);hash32(l.transactionHash);for(const k of ['blockNumber','transactionIndex','logIndex'])qty(l[k]);qty(l.blockTimestamp);assert.equal(BigInt(l.blockTimestamp),BigInt(x.blockTimestamp),'ANVIL_LOG_TIMESTAMP_MISMATCH');assert.equal(typeof l.removed,'boolean');assert.equal(l.removed,false);}
 }
 const e=s.scenarioEvidence;assert(e&&Object.getPrototypeOf(e)===Object.prototype,'SCENARIO_RECORD_REQUIRED');uint(e.end);dense(e.timedTransactions,32);for(const t of e.timedTransactions){record(t,['label','hash','block','blockHash','timestamp','expected','status','gasUsed']);assert.equal(typeof t.label,'string');hash32(t.hash);hash32(t.blockHash);assert(Number.isSafeInteger(t.block)&&t.block>=0);uint(t.timestamp);uint(t.expected);assert(Number.isSafeInteger(t.status));uint(t.gasUsed);}
 dense(e.stages,256);assert(e.stages.length>0,'FINAL_STAGE_REQUIRED');const p=e.stages.at(-1).snapshot.state.positions;dense(p,1);assert.equal(p.length,1,'FINAL_POSITION_REQUIRED');
 for(const x of p){uint(x.pid);uint(x.ledgerSequence);dense(x.position,32);uint(x.position[3]);uint(x.position[4]);dense(x.context,3);getAddress(x.context[0]);dense(x.context[1],5);x.context[1].forEach(uint);hash32(x.context[2]);dense(x.basis,8);hash32(x.basis[0]);x.basis.slice(1).forEach(uint);}
}
