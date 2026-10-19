import {LIMITS} from './collector.mjs';
function fail(code,httpStatus){const e=new Error(code);e.code=code;e.httpStatus=httpStatus;return e;}
export function createNodeTransport(endpoint,{fetchImpl=globalThis.fetch,schedule=setTimeout,cancel=clearTimeout}={}){
 const url=new URL(endpoint);if(!['https:','http:'].includes(url.protocol))throw fail('INVALID_ENDPOINT');
 const descriptor={host:url.hostname,settingSource:'BSC_TESTNET_RPC_URL'};
 let count=0;
 return {descriptor,request:async payload=>{
  if(!['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getTransactionReceipt'].includes(payload.method))throw fail('READ_ONLY_METHOD_REQUIRED');
  if(++count>LIMITS.maxRequests)throw fail('REQUEST_BUDGET_EXCEEDED');
  const controller=new AbortController(),timer=schedule(()=>controller.abort(),LIMITS.timeoutMs);
  try{
   const response=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
   if(!response.ok)throw fail('HTTP_ERROR',response.status);
   if(Number(response.headers.get('content-length'))>LIMITS.maxResponseBytes)throw fail('RESPONSE_TOO_LARGE');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMITS.maxResponseBytes)throw fail('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(value));}}
   finally{reader.releaseLock();}
   try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('INVALID_JSON');}
  }catch(e){if(controller.signal.aborted)throw fail('TIMEOUT');if(['HTTP_ERROR','RESPONSE_TOO_LARGE','INVALID_JSON'].includes(e.code))throw e;throw fail('TRANSPORT_ERROR');}
  finally{controller.abort();cancel(timer);}
 }};
}
