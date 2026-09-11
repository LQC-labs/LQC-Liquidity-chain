(function(root){
  'use strict';
  function executable({requestedDisabled=false,deployed=false,account=null,swapInFlight=false}={}){return !requestedDisabled&&deployed&&Boolean(account)&&!swapInFlight}
  function disabled(state){return!executable(state)}
  root.LQCTradeGate=Object.freeze({executable,disabled});
})(typeof window==='undefined'?globalThis:window);
