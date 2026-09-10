export function indexerHealth({now=Date.now(),startedAt,lastSuccessfulSyncAt=null,lastErrorAt=null,cursor,head=null,confirmations,syncing=false,reorgCount=0,lastReorgAt=null,maxStaleMs=30000,maxLagBlocks=2000,rpcConfigured=1,rpcHealthy=1,independentRpcVerified=false}){
  for(const [name,value] of Object.entries({now,startedAt,cursor,confirmations,reorgCount,maxStaleMs,maxLagBlocks,rpcConfigured,rpcHealthy}))if(!Number.isInteger(value)||value<0)throw new Error(`Indexer health ${name} is invalid.`);
  if(head!==null&&(!Number.isInteger(head)||head<0))throw new Error('Indexer health head is invalid.');
  const finalizedHead=head===null?null:Math.max(-1,head-confirmations);
  const indexedThrough=Math.max(-1,cursor-1);
  const lagBlocks=finalizedHead===null?null:Math.max(0,finalizedHead-indexedThrough);
  const stale=lastSuccessfulSyncAt===null||now-lastSuccessfulSyncAt>maxStaleMs;
  const rpcReady=rpcConfigured===1?rpcHealthy===1:rpcHealthy>=Math.floor(rpcConfigured/2)+1&&independentRpcVerified;
  const ready=!stale&&lagBlocks!==null&&lagBlocks<=maxLagBlocks&&rpcReady;
  return{status:ready?'ready':lastSuccessfulSyncAt===null?'starting':'degraded',ready,chainId:97,uptimeSeconds:Math.floor((now-startedAt)/1000),syncing,cursor,indexedThrough,head,finalizedHead,lagBlocks,lastSuccessfulSyncAt,lastErrorAt,reorgCount,lastReorgAt,rpc:{configured:rpcConfigured,healthy:rpcHealthy,independentVerified:independentRpcVerified}};
}
