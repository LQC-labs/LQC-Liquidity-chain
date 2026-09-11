import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context={};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/recovery-store.js'),'utf8'),context);
const fingerprint=`0x${'ab'.repeat(32)}`,hash=`0x${'12'.repeat(32)}`,key='pending:test';
class MemoryStorage{constructor(){this.values=new Map()}getItem(name){return this.values.has(name)?this.values.get(name):null}setItem(name,value){this.values.set(name,String(value))}removeItem(name){this.values.delete(name)}}
const make=(storage=new MemoryStorage(),now=()=>1_000_000)=>context.LQCRecoveryStore.create({storage,key,deploymentFingerprint:fingerprint,isTransactionHash:value=>/^0x[0-9a-f]{64}$/.test(value),now});
const quote={amountOut:9n,execution:{minimumAmountOut:8n}},settlement={minimumAmountOut:8n};

describe('LQC pending execution recovery store',function(){
  it('round-trips a valid pending execution including bigint fields',function(){const store=make();assert.equal(store.state().state,'none');store.remember(hash,quote,settlement);const record=store.state();assert.equal(record.state,'valid');assert.equal(record.value.anchorQuote.amountOut,9n);store.clear();assert.equal(store.state().state,'none')});
  it('fails closed on corrupted, wrong-deployment, and future-dated records',function(){const storage=new MemoryStorage(),store=make(storage);storage.setItem(key,'{');assert.equal(store.state().state,'invalid');storage.setItem(key,JSON.stringify({version:1,deploymentFingerprint:`0x${'cd'.repeat(32)}`,transactionHash:hash,anchorQuote:{},settlementContext:{},submittedAt:1_000_000}));assert.equal(store.state().state,'invalid');storage.setItem(key,JSON.stringify({version:1,deploymentFingerprint:fingerprint,transactionHash:hash,anchorQuote:{},settlementContext:{},submittedAt:1_300_001}));assert.equal(store.state().state,'invalid')});
  it('proves a full recovery reservation can be written, read, and removed',function(){const storage=new MemoryStorage(),store=make(storage);store.assertAvailable(quote);assert.equal(storage.getItem(store.reservationKey),null)});
  it('blocks signing when storage rejects, changes, or retains the reservation',function(){const stores=[{getItem:()=>null,setItem(){throw new Error('quota')},removeItem(){}},{getItem:()=>'{changed}',setItem(){},removeItem(){}},{value:null,getItem(){return this.value},setItem(_,value){this.value=value},removeItem(){}}];for(const storage of stores)assert.throws(()=>make(storage).assertAvailable(quote),/PendingExecutionStorageUnavailable/)});
});
