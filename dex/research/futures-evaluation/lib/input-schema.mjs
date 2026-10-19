import { getAddress } from 'ethers';
export function record(x, required, optional=[]) {
 if(!x||Object.getPrototypeOf(x)!==Object.prototype)throw Error('PLAIN_RECORD_REQUIRED');
 const keys=Reflect.ownKeys(x);if(keys.some(k=>typeof k!=='string'||(!required.includes(k)&&!optional.includes(k))))throw Error('ADDITIONAL_FIELD');
 for(const k of required)if(!Object.hasOwn(x,k))throw Error('MISSING_FIELD:'+k);
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(x,k);if(!d.enumerable||!Object.hasOwn(d,'value'))throw Error('ACCESSOR_OR_HIDDEN_FIELD');}
}
export function dense(x,max=256){
 if(!Array.isArray(x)||Object.getPrototypeOf(x)!==Array.prototype||x.length>max)throw Error('DENSE_ARRAY_REQUIRED');
 const own=Reflect.ownKeys(x);if(own.length!==x.length+1)throw Error('SPARSE_OR_EXTENDED_ARRAY');
 for(let i=0;i<x.length;i++){const d=Object.getOwnPropertyDescriptor(x,String(i));if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw Error('SPARSE_OR_ACCESSOR_ARRAY');}
}
export function uint(x){if(typeof x!=='string'||x.length>78||!/^(0|[1-9][0-9]*)$/.test(x)||BigInt(x)>((1n<<256n)-1n))throw Error('INVALID_UINT_STRING');return BigInt(x);}
export function hash32(x){if(typeof x!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(x))throw Error('INVALID_BYTES32');return x.toLowerCase();}
export function address(x){if(typeof x!=='string')throw Error('INVALID_ADDRESS');return getAddress(x);}
export function decimals(x){const n=uint(x);if(n>255n)throw Error('DECIMALS_OUT_OF_RANGE');if(!['6','18'].includes(x))throw Error('UNSUPPORTED_COLLATERAL_DECIMALS');return x;}
function text(x){if(typeof x!=='string'||x.length<1||x.length>128)throw Error('INVALID_TEXT');}
export function validateScope(s){
 record(s,['chainId','evidenceSchema','registry','contracts','queryBlock']);
 if(s.chainId!==null)uint(s.chainId);if(s.evidenceSchema!==null)text(s.evidenceSchema);address(s.registry);
 dense(s.contracts,12);if(s.contracts.length!==12)throw Error('CONTRACT_SET_SIZE');
 const seen=new Set();for(const p of s.contracts){record(p,['address','runtimeHash']);const a=address(p.address).toLowerCase();hash32(p.runtimeHash);if(seen.has(a))throw Error('DUPLICATE_CONTRACT');seen.add(a);}
 record(s.queryBlock,['number','hash']);if(s.queryBlock.number!==null)uint(s.queryBlock.number);if(s.queryBlock.hash!==null)hash32(s.queryBlock.hash);return s;
}
export function compareScope(expected,observed){
 validateScope(expected);validateScope(observed);const blockers=[];
 if(address(expected.registry)!==address(observed.registry))throw Error('REGISTRY_SCOPE_MISMATCH');
 for(let i=0;i<12;i++)if(address(expected.contracts[i].address)!==address(observed.contracts[i].address)||hash32(expected.contracts[i].runtimeHash)!==hash32(observed.contracts[i].runtimeHash))throw Error('CONTRACT_SCOPE_MISMATCH');
 for(const [key,a,b]of [['CHAIN_ID',expected.chainId,observed.chainId],['EVIDENCE_SCHEMA',expected.evidenceSchema,observed.evidenceSchema],['QUERY_BLOCK_NUMBER',expected.queryBlock.number,observed.queryBlock.number],['QUERY_BLOCK_HASH',expected.queryBlock.hash,observed.queryBlock.hash]]){
  if(a===null)blockers.push(key+'_EXPECTATION_UNSET');if(b===null)blockers.push(key+'_EVIDENCE_MISSING');
  if(a!==null&&b!==null&&(key==='QUERY_BLOCK_HASH'?hash32(a)!==hash32(b):a!==b))throw Error(key+'_SCOPE_MISMATCH');
 }
 return {status:blockers.length?'UNVERIFIED':'RECORDED_FIELDS_MATCH',blockers};
}
export function canonical(value,depth=0){
 if(depth>64)throw Error('CANONICAL_DEPTH_LIMIT');
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))throw Error('NON_CANONICAL_NUMBER');return JSON.stringify(value);}
 if(typeof value==='bigint'||typeof value==='undefined')throw Error('NON_CANONICAL_TYPE');
 if(Array.isArray(value)){dense(value,4096);return '['+value.map(v=>canonical(v,depth+1)).join(',')+']';}
 if(value&&Object.getPrototypeOf(value)===Object.prototype){record(value,[],Object.keys(value));return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';}
 throw Error('NON_CANONICAL_TYPE');
}
export function validatePrice(p,timestamp){
 record(p,['market18','collateral18','marketTime','collateralTime','trust','unit']);
 if(p.unit!=='FIXED_18')throw Error('PRICE_UNIT_MISMATCH');
 if(p.trust!=='RECORDED_LOCAL_MOCK_ONLY')throw Error('PRICE_TRUST_MISMATCH');
 if(uint(p.market18)===0n||uint(p.collateral18)===0n)throw Error('ZERO_RECORDED_PRICE');
 if(uint(p.marketTime)>uint(timestamp)||uint(p.collateralTime)>uint(timestamp))throw Error('PRICE_TIME_AFTER_TRANSACTION');
}
export function validateRequest(r){
 record(r,['pid','account','domain','series','scope','submittedLegs'],['policyEvidence','priceEvidence']);
 uint(r.pid);uint(r.domain);uint(r.series);address(r.account);validateScope(r.scope);dense(r.submittedLegs,256);
 for(const l of r.submittedLegs){
  record(l,['pid','side','sequence','timestamp','transactionHash','block','oldL','oldS','nextL','nextS','receipt','quantity','cumulativeClosed','final','boundary','entryPrice18','observedPrice']);
  for(const k of ['pid','sequence','timestamp','block','oldL','oldS','nextL','nextS','quantity','cumulativeClosed','entryPrice18'])uint(l[k]);
  hash32(l.transactionHash);hash32(l.receipt);if(!['LONG','SHORT'].includes(l.side)||typeof l.final!=='boolean'||!['BEFORE_E','AT_E','AFTER_E'].includes(l.boundary))throw Error('INVALID_LEG_ENUM');
  if(uint(l.entryPrice18)===0n)throw Error('ZERO_ENTRY_PRICE');validatePrice(l.observedPrice,l.timestamp);
 }
 if(r.policyEvidence!==undefined&&r.policyEvidence!==null){record(r.policyEvidence,['schema','version','commitment']);if(r.policyEvidence.schema!=='UNVERIFIED_POLICY_REFERENCE_V1')throw Error('POLICY_REFERENCE_SCHEMA');text(r.policyEvidence.version);hash32(r.policyEvidence.commitment);}
 if(r.priceEvidence!==undefined&&r.priceEvidence!==null){record(r.priceEvidence,['schema','sourceCommitment','unit']);if(r.priceEvidence.schema!=='UNVERIFIED_PRICE_REFERENCE_V1'||r.priceEvidence.unit!=='FIXED_18')throw Error('PRICE_REFERENCE_SCHEMA');hash32(r.priceEvidence.sourceCommitment);}
 if(Object.hasOwn(r,'policyEvidence')&&r.policyEvidence===undefined||Object.hasOwn(r,'priceEvidence')&&r.priceEvidence===undefined)throw Error('UNDEFINED_EVIDENCE');
 const normalized={...r,policyEvidence:r.policyEvidence??null,priceEvidence:r.priceEvidence??null};canonical(normalized);return normalized;
}