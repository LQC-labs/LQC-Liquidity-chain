(function(root){
  'use strict';
  function storageAction({expectedStorage,keyMatches,record,unverifiedTransactionHash,pendingRecoveryActive}){
    if(!expectedStorage||!keyMatches)return'ignore';
    if(record?.state==='invalid')return'invalid';
    if(record?.state==='none')return unverifiedTransactionHash||pendingRecoveryActive?'retain':'release';
    if(record?.state!=='valid')return'invalid';
    if(record.value.transactionHash===unverifiedTransactionHash&&!record.value.cancellationHash)return'ignore';
    return'recover';
  }
  root.LQCRecoverySync=Object.freeze({storageAction});
})(typeof window==='undefined'?globalThis:window);
