(function(root){
  'use strict';
  function create(){
    let version=0;
    const snapshot=context=>Object.freeze({...context});
    const same=(a,b)=>Boolean(a&&b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
    function begin(context){return Object.freeze({version:++version,context:snapshot(context)})}
    function invalidate(){return++version}
    function isCurrent(ticket,context){return Boolean(ticket)&&ticket.version===version&&same(ticket.context,context)}
    return Object.freeze({begin,invalidate,isCurrent});
  }
  root.LQCQuoteSessionGuard=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
