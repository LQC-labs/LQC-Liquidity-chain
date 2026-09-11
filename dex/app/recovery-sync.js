(function(root){
  'use strict';
  function storageAction({expectedStorage,keyMatches,newValue,record,unverifiedTransactionHash,pendingRecoveryActive}){
    if(!expectedStorage||!keyMatches)return'ignore';
    if(newValue===null)return unverifiedTransactionHash||pendingRecoveryActive?'retain':'release';
    if(record?.state==='invalid')return'invalid';
    if(record?.state!=='valid')return'ignore';
    if(record.value.transactionHash===unverifiedTransactionHash&&!record.value.cancellationHash)return'ignore';
    return'recover';
  }
  root.LQCRecoverySync=Object.freeze({storageAction});
})(typeof window==='undefined'?globalThis:window);
