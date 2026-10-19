
import assert from 'node:assert/strict';
export function integer(x){if(typeof x==='bigint')return x;assert(typeof x==='string'&&/^(0|-?[1-9][0-9]*)$/.test(x),'INTEGER_STRING_OR_BIGINT_REQUIRED');return BigInt(x);}
export function unsigned(x){const n=integer(x);assert(n>=0n,'NEGATIVE_UNSIGNED');return n;}
export function rational(n,d){n=integer(n);d=integer(d);assert(d!==0n,'ZERO_DENOMINATOR');if(d<0n){n=-n;d=-d;}if(n===0n)return {n:0n,d:1n};let a=n<0n?-n:n,b=d;while(b!==0n){const r=a%b;a=b;b=r;}return {n:n/a,d:d/a};}
export const add=(a,b)=>rational(a.n*b.d+b.n*a.d,a.d*b.d);
export const subtract=(a,b)=>rational(a.n*b.d-b.n*a.d,a.d*b.d);
export const multiply=(a,b)=>rational(a.n*b.n,a.d*b.d);
export const divide=(a,b)=>rational(a.n*b.d,a.d*b.n);
export const wire=f=>({n:f.n.toString(),d:f.d.toString()});
export const sameFraction=(a,b)=>a.n*b.d===b.n*a.d;
export function pnlDiagnostic({quantity18,side,entry18,market18,collateral18,decimals,quantityUnit,priceUnit}){
 assert.equal(quantityUnit,'USD18_NOTIONAL','QUANTITY_UNIT_MISMATCH');assert.equal(priceUnit,'FIXED_18','PRICE_UNIT_MISMATCH');
 const q=unsigned(quantity18),entry=unsigned(entry18),market=unsigned(market18),collateral=unsigned(collateral18),d=unsigned(decimals);
 assert(q>0n,'ZERO_EXIT_QUANTITY');assert(entry>0n&&collateral>0n,'ZERO_DENOMINATOR');assert(market>0n,'ZERO_MARKET_PRICE');assert(d<=255n,'DECIMALS_OUT_OF_RANGE');assert(side==='LONG'||side==='SHORT','INVALID_DIRECTION');
 const usd18=rational(q*(market-entry)*(side==='LONG'?1n:-1n),entry);
 return {usd18,rawToken:multiply(usd18,rational(10n**d,collateral))};
}
