
import assert from 'node:assert/strict';
import {unsigned} from './exact-rational.mjs';
import {canonical} from './input-schema.mjs';

// Shared strict input validation is performed by integrateHistory first.
// This calculation rereads raw transitions. It consumes no generated intervals,
// primary deltas, running OI, per-Epoch sums, or lot totals.
// Integration by parts: sum((oldQ-nextQ) * clipped elapsed time).
export function rawTransitionIntegrals(input){
 const result={official:{long:0n,short:0n},gap:{long:0n,short:0n}};
 const cutoff=unsigned(input.cutoff);
 for(const raw of input.transitions){
  const t=unsigned(raw.timestamp);
  const changeL=unsigned(raw.oldL)-unsigned(raw.nextL);
  const changeS=unsigned(raw.oldS)-unsigned(raw.nextS);
  for(const epoch of input.officialEpochs){
   const start=unsigned(epoch.from),end=unsigned(epoch.to);
   let elapsed;
   if(t<=start)elapsed=0n;
   else if(t>=end)elapsed=end-start;
   else elapsed=t-start;
   result.official.long+=changeL*elapsed;
   result.official.short+=changeS*elapsed;
  }
  const elapsedGap=t>cutoff?t-cutoff:0n;
  result.gap.long+=changeL*elapsedGap;
  result.gap.short+=changeS*elapsedGap;
 }
 return {official:{long:result.official.long.toString(),short:result.official.short.toString()},gap:{long:result.gap.long.toString(),short:result.gap.short.toString()}};
}
export function assertIndependentExposure(primary,reference){
 assert.equal(canonical(primary),canonical(reference),'RAW_TRANSITION_INTEGRAL_MISMATCH');
}
