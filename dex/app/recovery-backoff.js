(function(root){
  'use strict';
  function delay(attempt,{baseMs=30000,maxMs=300000}={}){
    if(!Number.isInteger(attempt)||attempt<0)throw new Error('Recovery attempt must be a non-negative integer');
    if(!Number.isSafeInteger(baseMs)||baseMs<1000)throw new Error('Recovery base delay is invalid');
    if(!Number.isSafeInteger(maxMs)||maxMs<baseMs)throw new Error('Recovery maximum delay is invalid');
    return Math.min(maxMs,baseMs*(2**Math.min(attempt,52)));
  }
  root.LQCRecoveryBackoff=Object.freeze({delay});
})(typeof window==='undefined'?globalThis:window);
