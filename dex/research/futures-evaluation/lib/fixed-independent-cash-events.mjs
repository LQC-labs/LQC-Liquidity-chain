// One synthetic raw definition. R1/TX are labels, never authenticated Receipts.
import {assert,hash,freeze} from './policy-v1-common.mjs';
import {entriesState} from './settlement-link-diagnosis.mjs';
import {strictUnsigned} from './fixed-independent-comparator.mjs';
export const SYNTHETIC_CASH_ACCOUNTS=freeze({A:'0x0000000000000000000000000000000000000065',B:'0x0000000000000000000000000000000000000066',C:'0x0000000000000000000000000000000000000067',D:'0x0000000000000000000000000000000000000068'});
export const SYNTHETIC_CASH_EVENTS=freeze([
 {id:'1',account:'A',pid:'1',obligation:'A-debt',kind:'COLLECT',amount:'2',sequence:'1',receipt:'R1',transaction:'TX',logIndex:'0',itemIndex:'0'},
 {id:'2',account:'B',pid:'2',obligation:'B-debt',kind:'COLLECT',amount:'1',sequence:'1',receipt:'R2',transaction:'TX',logIndex:'1',itemIndex:'0'},
 {id:'3',account:'C',pid:'3',obligation:'C-claim',kind:'PAY',amount:'1',sequence:'1',receipt:'R3',transaction:'TX',logIndex:'2',itemIndex:'0'}
]);
const FIELDS=['id','account','pid','obligation','kind','amount','sequence','receipt','transaction','logIndex','itemIndex'];
const group=e=>e.account+':'+e.kind,unit=e=>JSON.stringify([e.transaction,e.logIndex,e.itemIndex]);
function inspectRaw(raw){
 assert(Array.isArray(raw)&&raw.length>0,'CASH_RAW_REQUIRED');const units=new Set(),ids=new Set(),states=new Map();
 for(let i=0;i<raw.length;i++){
  assert(Object.hasOwn(raw,i),'CASH_RAW_SPARSE');const e=raw[i];assert.deepEqual(Object.keys(e).sort(),[...FIELDS].sort(),'CASH_RAW_SCHEMA');
  assert(Object.hasOwn(SYNTHETIC_CASH_ACCOUNTS,e.account),'CASH_RAW_OWNER');assert.equal(e.pid,{A:'1',B:'2',C:'3',D:'4'}[e.account],'CASH_RAW_POSITION');assert(['COLLECT','PAY'].includes(e.kind),'CASH_RAW_OPERATION_UNSUPPORTED');
  assert.equal(e.obligation,e.account+(e.kind==='COLLECT'?'-debt':'-claim'),'CASH_RAW_OBLIGATION');assert(strictUnsigned(e.amount)>0n,'CASH_RAW_AMOUNT');strictUnsigned(e.sequence);strictUnsigned(e.logIndex);strictUnsigned(e.itemIndex);
  assert(typeof e.receipt==='string'&&e.receipt.length>0&&typeof e.transaction==='string'&&e.transaction.length>0,'CASH_RAW_RECEIPT');assert(!ids.has(e.id),'CASH_RAW_DUPLICATE_ID');ids.add(e.id);assert(!units.has(unit(e)),'CASH_RAW_REUSED_UNIT');units.add(unit(e));
  const key=group(e),state=states.get(key)||{sequence:0n,cumulative:0n,receipt:null};assert.equal(strictUnsigned(e.sequence),state.sequence+1n,'CASH_RAW_GROUP_SEQUENCE');state.sequence++;state.cumulative+=strictUnsigned(e.amount);state.receipt=e.receipt;states.set(key,state);
 }
 return states;
}
function ledgerId(e){return hash({namespace:'SYNTHETIC_CASH_RAW_EVENT_BINDING',event:e});}
function expectedTerminals(raw){
 const groups=new Map();for(const e of raw){const k=group(e);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
 return [...groups].map(([id,rows])=>{let cumulative=0n;const state=entriesState(rows.map(e=>({sequence:e.sequence,receipt:hash({syntheticReceipt:e.receipt}),amount:e.amount,cumulative:(cumulative+=strictUnsigned(e.amount)).toString()})));return {id,sequence:state.sequence,receipt:rows.at(-1).receipt,cumulative:state.cumulative};});
}
export function buildSyntheticCashEventViews(binding){
 inspectRaw(SYNTHETIC_CASH_EVENTS);return {ledgerEvents:SYNTHETIC_CASH_EVENTS.map((e,i)=>({id:ledgerId(e),sequence:String(i+1),kind:e.kind,account:SYNTHETIC_CASH_ACCOUNTS[e.account],amount:e.amount,binding,provenance:'SYNTHETIC_RECEIPT_MODEL_NOT_VERIFIED_CASH'})),bookEvents:structuredClone(SYNTHETIC_CASH_EVENTS),terminals:expectedTerminals(SYNTHETIC_CASH_EVENTS)};
}
export function validateSyntheticCashEventLinks(ledgerEvents,bookEvents,terminals,binding){
 const raw=SYNTHETIC_CASH_EVENTS;inspectRaw(raw);assert(Array.isArray(ledgerEvents)&&Array.isArray(bookEvents),'CASH_EVENT_ARRAYS_REQUIRED');assert.equal(ledgerEvents.length,raw.length,'CASH_LEDGER_EVENT_COUNT');assert.equal(bookEvents.length,raw.length,'CASH_BOOK_EVENT_COUNT');
 for(let i=0;i<raw.length;i++){
  const r=raw[i],l=ledgerEvents[i],b=bookEvents[i];assert.deepEqual(Object.keys(l).sort(),['id','sequence','kind','account','amount','binding','provenance'].sort(),'CASH_LEDGER_SCHEMA');assert.deepEqual(Object.keys(b).sort(),[...FIELDS].sort(),'CASH_BOOK_SCHEMA');
  assert.equal(l.id,ledgerId(r),'CASH_LEDGER_RAW_RECEIPT_UNIT_BINDING');assert.equal(l.sequence,String(i+1),'CASH_LEDGER_GLOBAL_SEQUENCE_LINK');assert.equal(l.account,SYNTHETIC_CASH_ACCOUNTS[r.account],'CASH_LEDGER_OWNER_LINK');assert.equal(l.kind,r.kind,'CASH_LEDGER_OPERATION_LINK');assert.equal(l.amount,r.amount,'CASH_LEDGER_AMOUNT_LINK');assert.equal(l.binding,binding,'CASH_LEDGER_BINDING_LINK');assert.equal(l.provenance,'SYNTHETIC_RECEIPT_MODEL_NOT_VERIFIED_CASH','CASH_LEDGER_PROVENANCE');
  for(const field of FIELDS)assert.equal(b[field],r[field],'CASH_BOOK_'+field.toUpperCase()+'_LINK');
 }
 assert.deepEqual(terminals,expectedTerminals(raw),'CASH_TERMINAL_LINK');
 return {status:'SYNTHETIC_RAW_EVENT_LINK_MATCH',ledgerEventCount:ledgerEvents.length,bookEventCount:bookEvents.length,fields:['amount','owner','operation','position','obligation','physicalUnit','businessReceipt','globalSequence','groupSequence','terminal'],rawDefinition:'ONE_FIXED_SYNTHETIC_EVENT_LIST',receiptAuthenticated:false,persistentConsumptionAuthenticated:false,refundSupported:false};
}
