
import assert from 'node:assert/strict';
import {keccak256,toUtf8Bytes,getAddress} from 'ethers';
import {record,dense,canonical,hash32,uint} from './input-schema.mjs';
import {rational,add,subtract,multiply,divide,wire} from './exact-rational.mjs';
export {assert,record,dense,canonical,hash32,uint,rational,add,subtract,multiply,divide,wire};
export const ECONOMIC_POLICY_VERSION='LQC_SETTLEMENT_POLICY_V1';
export const POLICY_CALCULATION_VERSION='LQC_POLICY_V1_RESEARCH_CALCULATOR_1';
export const hash=x=>keccak256(toUtf8Bytes(canonical(x)));
export const zero=()=>rational(0n,1n);
export const eq=(a,b,code)=>assert.equal(canonical(a),canonical(b),code);
export const address=x=>{assert(typeof x==='string','ADDRESS_STRING_REQUIRED');const a=getAddress(x);assert(a!=='0x0000000000000000000000000000000000000000','ZERO_ADDRESS');return a;};
export function fraction(x){record(x,['n','d']);const n=uint(x.n),d=uint(x.d);assert(d>0n,'ZERO_DENOMINATOR');return rational(n,d);}
export const cmp=(a,b)=>a.n*b.d-b.n*a.d;
export const floor=x=>{assert(x.n>=0n&&x.d>0n);return x.n/x.d;};
export const ceil=x=>floor(x)+(x.n%x.d===0n?0n:1n);
export function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
export function strictWire(x,depth=0){
 assert(depth<=64,'INPUT_DEPTH_LIMIT');
 assert(typeof x!=='number'&&typeof x!=='bigint'&&typeof x!=='undefined','WIRE_TYPE_FORBIDDEN');
 if(Array.isArray(x)){dense(x,4096);for(const v of x)strictWire(v,depth+1);}
 else if(x&&typeof x==='object'){record(x,[],Object.keys(x));for(const v of Object.values(x))strictWire(v,depth+1);}
}
export const NO_AUTHORITY=Object.freeze({fundsAuthority:false,settlementAuthorized:false,createsClaim:false,consumesHistory:false,returnAuthorized:false,heldUseAuthorized:false,lpRecoveryAuthorized:false,rightsTransferAuthorized:false});
