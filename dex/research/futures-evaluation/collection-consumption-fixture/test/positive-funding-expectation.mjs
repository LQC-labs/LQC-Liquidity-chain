import assert from 'node:assert/strict';
const W=10n**18n,U=10n**6n;
// Independent rational arithmetic from fixed inputs, not Coordinator/calculator output.
const gcd=(a,b)=>b?gcd(b,a%b):a;
const fraction=(n,d)=>{assert(d>0n);const g=gcd(n<0n?-n:n,d);return {n:n/g,d:d/g};};
export function independentExpectation(){
 const duration=100n,dt=50n-10n,le=W*dt,se=3n*W*dt,matched=W*dt;
 const usd=fraction(matched*(se-le)*1n,duration*(le+se)*10000n);
 const raw=fraction(usd.n*U,usd.d*W);
 const pnl=fraction(3n*W*(12n*W/10n-W)*U,W*W);
 assert.deepEqual(usd,{n:20000000000000n,d:1n});assert.deepEqual(raw,{n:20n,d:1n});assert.deepEqual(pnl,{n:600000n,d:1n});
 return {le,se,matched,usd,shortDebt:raw,longClaim:raw,pnl,fee:{n:0n,d:1n},total:pnl.n+raw.n};
}

