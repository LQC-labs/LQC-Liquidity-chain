(function(root){
  'use strict';
  function create({storage,key,deploymentFingerprint,validatePayload=()=>true,now=Date.now}){
    if(!storage||typeof key!=='string'||!key||typeof deploymentFingerprint!=='string'||typeof validatePayload!=='function'||typeof now!=='function')throw new Error('Invalid approval reservation store configuration');
    const jsonSafe=value=>JSON.parse(JSON.stringify(value,(_,item)=>typeof item==='bigint'?`${item}n`:item));
    const revive=value=>{if(Array.isArray(value))return value.map(revive);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,revive(item)]));return typeof value==='string'&&/^\d+n$/.test(value)?BigInt(value.slice(0,-1)):value};
    function state(){let raw;try{raw=storage.getItem(key)}catch{return Object.freeze({state:'invalid'})}if(raw===null)return Object.freeze({state:'none'});try{const value=revive(JSON.parse(raw)),reservedAt=Number(value?.reservedAt),valid=value&&value.version===1&&value.deploymentFingerprint===deploymentFingerprint&&value.anchorQuote&&value.settlementContext&&Number.isSafeInteger(reservedAt)&&reservedAt>0&&reservedAt<=now()+300000&&validatePayload(value);return valid?Object.freeze({state:'valid',value,serialized:raw}):Object.freeze({state:'invalid'})}catch{return Object.freeze({state:'invalid'})}}
    function reserve(anchorQuote,settlementContext){const value={version:1,deploymentFingerprint,anchorQuote,settlementContext,reservedAt:now()};if(!validatePayload(value))throw new Error('InvalidApprovalReservation');const serialized=JSON.stringify(jsonSafe(value));try{const current=state();if(current.state!=='none'||storage.getItem(key)!==null)throw new Error('PendingApprovalReservationConflict');storage.setItem(key,serialized);if(storage.getItem(key)!==serialized)throw new Error('PendingApprovalReservationUnavailable');return serialized}catch(error){if(error?.message==='PendingApprovalReservationConflict'||error?.message==='InvalidApprovalReservation')throw error;throw new Error('PendingApprovalReservationUnavailable')}}
    function clear(serialized){try{if(typeof serialized!=='string'||storage.getItem(key)!==serialized)return false;storage.removeItem(key);return storage.getItem(key)===null}catch{return false}}
    return Object.freeze({key,state,reserve,clear});
  }
  root.LQCApprovalReservationStore=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
