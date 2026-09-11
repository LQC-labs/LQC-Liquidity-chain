import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const context={};
vm.runInNewContext(fs.readFileSync(path.resolve(import.meta.dirname,'../app/approval-reservation-store.js'),'utf8'),context);
class MemoryStorage{constructor(){this.values=new Map()}getItem(key){return this.values.has(key)?this.values.get(key):null}setItem(key,value){this.values.set(key,String(value))}removeItem(key){this.values.delete(key)}}
const fingerprint=`0x${'ab'.repeat(32)}`,binding={transaction:{nonce:7},execution:{sender:`0x${'12'.repeat(20)}`}},approval={kind:'approval',amount:9n};
const make=(storage=new MemoryStorage(),now=()=>1_000_000)=>context.LQCApprovalReservationStore.create({storage,key:'approval:prepared',deploymentFingerprint:fingerprint,validatePayload:value=>value.settlementContext?.kind==='approval',now});

describe('LQC approval signing reservation store',function(){
  it('durably reserves the complete approval and clears only the same record',function(){const store=make(),serialized=store.reserve(binding,approval),record=store.state();assert.equal(record.state,'valid');assert.equal(record.value.settlementContext.amount,9n);assert.equal(store.clear('changed'),false);assert.equal(store.clear(serialized),true);assert.equal(store.state().state,'none')});
  it('fails closed on corruption, deployment mismatch, and future timestamps',function(){const storage=new MemoryStorage(),store=make(storage);storage.setItem(store.key,'{');assert.equal(store.state().state,'invalid');storage.setItem(store.key,JSON.stringify({version:1,deploymentFingerprint:'wrong',anchorQuote:{},settlementContext:{kind:'approval'},reservedAt:1_000_000}));assert.equal(store.state().state,'invalid');storage.setItem(store.key,JSON.stringify({version:1,deploymentFingerprint:fingerprint,anchorQuote:{},settlementContext:{kind:'approval'},reservedAt:1_300_001}));assert.equal(store.state().state,'invalid')});
  it('rejects conflicting reservations and unavailable storage',function(){const store=make();store.reserve(binding,approval);assert.throws(()=>store.reserve(binding,approval),/Conflict/);const broken={getItem:()=>null,setItem(){throw new Error('quota')},removeItem(){}};assert.throws(()=>make(broken).reserve(binding,approval),/Unavailable/)});
  it('rejects a payload before writing when approval validation fails',function(){const storage=new MemoryStorage(),store=context.LQCApprovalReservationStore.create({storage,key:'approval:prepared',deploymentFingerprint:fingerprint,validatePayload:()=>false,now:()=>1_000_000});assert.throws(()=>store.reserve(binding,approval),/InvalidApprovalReservation/);assert.equal(storage.getItem(store.key),null)});
  it('reports an invalid fail-closed state when reservation storage cannot be read',function(){const storage={getItem(){throw new Error('denied')},setItem(){},removeItem(){}},store=make(storage);assert.equal(store.state().state,'invalid')});
  it('retains the lock without throwing when reservation removal is unavailable',function(){const storage=new MemoryStorage(),store=make(storage),serialized=store.reserve(binding,approval);storage.removeItem=()=>{throw new Error('denied')};assert.equal(store.clear(serialized),false);assert.equal(store.state().state,'valid')});
});
