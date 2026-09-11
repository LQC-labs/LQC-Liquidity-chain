(function(root){
  'use strict';
  function create(){
    let version=0,currentTarget=null;
    function begin(target){if(!target)throw new Error('Wallet target is required');currentTarget=target;return++version}
    function invalidate(){currentTarget=null;return++version}
    function isCurrent(target,snapshot){return Boolean(target)&&target===currentTarget&&Number.isSafeInteger(snapshot)&&snapshot===version}
    function assertCurrent(target,snapshot){if(!isCurrent(target,snapshot))throw new Error('WalletConnectionSuperseded');return true}
    return Object.freeze({begin,invalidate,isCurrent,assertCurrent});
  }
  root.LQCWalletSessionGuard=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
