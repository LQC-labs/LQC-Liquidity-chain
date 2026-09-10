(function(root){
  'use strict';
  function classify({latencyMs=0,ageSeconds=0,consecutiveFailures=0,online=true}={}){
    if(typeof online!=='boolean'||!Number.isFinite(latencyMs)||latencyMs<0||!Number.isFinite(ageSeconds)||ageSeconds<0||!Number.isInteger(consecutiveFailures)||consecutiveFailures<0)throw new Error('Chart health input is invalid');
    if(!online)return Object.freeze({level:'interrupted',label:'연결 중단',retry:true});
    if(consecutiveFailures>=3)return Object.freeze({level:'interrupted',label:'연결 중단',retry:true});
    if(consecutiveFailures>0||latencyMs>1500||ageSeconds>15)return Object.freeze({level:'delayed',label:'연결 지연',retry:true});
    return Object.freeze({level:'healthy',label:'실시간 정상',retry:false});
  }
  function chainSync(finalizedBlock,chainHead,confirmations=12){
    if(!Number.isSafeInteger(finalizedBlock)||finalizedBlock<0||!Number.isSafeInteger(chainHead)||chainHead<0||!Number.isSafeInteger(confirmations)||confirmations<2)throw new Error('Chart chain sync input is invalid');
    if(finalizedBlock>chainHead)return Object.freeze({level:'unverified',label:'온체인 확인 불가',lagBlocks:0});
    const lagBlocks=chainHead-finalizedBlock;
    if(lagBlocks<=confirmations+3)return Object.freeze({level:'synced',label:'온체인 동기화',lagBlocks});
    if(lagBlocks<=confirmations+20)return Object.freeze({level:'catching-up',label:'블록 동기화 지연',lagBlocks});
    return Object.freeze({level:'stale',label:'블록 동기화 중단',lagBlocks});
  }
  function consensusHead(heads,configuredSources=heads?.length,maxSpread=3){
    if(!Array.isArray(heads)||!Number.isSafeInteger(configuredSources)||configuredSources<1||configuredSources<heads.length||!Number.isSafeInteger(maxSpread)||maxSpread<0||heads.some(head=>!Number.isSafeInteger(head)||head<0))throw new Error('Chart RPC consensus input is invalid');
    const ordered=[...heads].sort((a,b)=>a-b),quorum=Math.floor(configuredSources/2)+1;let best=[];
    for(let start=0;start<ordered.length;start++){const cluster=ordered.slice(start).filter(head=>head-ordered[start]<=maxSpread);if(cluster.length>best.length)best=cluster}
    if(best.length<quorum)return null;
    return Object.freeze({head:best[0],healthySources:best.length,configuredSources,independent:configuredSources>1});
  }
  function consensusHash(hashes,configuredSources=hashes?.length){
    if(!Array.isArray(hashes)||!Number.isSafeInteger(configuredSources)||configuredSources<1||configuredSources<hashes.length||hashes.some(hash=>typeof hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(hash)))throw new Error('Chart RPC block hash consensus input is invalid');
    const quorum=Math.floor(configuredSources/2)+1,counts=new Map();let bestHash=null,bestCount=0;
    for(const value of hashes){const hash=value.toLowerCase(),count=(counts.get(hash)||0)+1;counts.set(hash,count);if(count>bestCount){bestHash=hash;bestCount=count}}
    if(bestCount<quorum)return null;
    return Object.freeze({blockHash:bestHash,healthySources:bestCount,configuredSources,independent:configuredSources>1});
  }
  function sourceHealth(current,healthy,now=Date.now(),failureThreshold=3,quarantineMs=60000){
    if(!current||!Number.isSafeInteger(current.failures)||current.failures<0||!Number.isFinite(current.quarantinedUntil)||current.quarantinedUntil<0||typeof healthy!=='boolean'||!Number.isFinite(now)||now<0||!Number.isSafeInteger(failureThreshold)||failureThreshold<1||!Number.isFinite(quarantineMs)||quarantineMs<1000)throw new Error('Chart RPC source health input is invalid');
    if(healthy)return Object.freeze({failures:0,quarantinedUntil:0});
    if(current.quarantinedUntil>now)return Object.freeze({failures:current.failures,quarantinedUntil:current.quarantinedUntil});
    const failures=(current.quarantinedUntil>0?0:current.failures)+1;
    return Object.freeze({failures:failures>=failureThreshold?0:failures,quarantinedUntil:failures>=failureThreshold?now+quarantineMs:0});
  }
  function sourceHealthSnapshot(sources,fingerprint,now=Date.now()){
    if(!Array.isArray(sources)||typeof fingerprint!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(fingerprint)||!Number.isFinite(now)||now<0||sources.some(item=>!item||!Number.isSafeInteger(item.failures)||item.failures<0||item.failures>2||!Number.isFinite(item.quarantinedUntil)||item.quarantinedUntil<0||item.quarantinedUntil>now+60000))throw new Error('Chart RPC health snapshot input is invalid');
    return Object.freeze({version:1,fingerprint:fingerprint.toLowerCase(),savedAt:now,sources:sources.map(item=>Object.freeze({failures:item.failures,quarantinedUntil:item.quarantinedUntil}))});
  }
  function restoreSourceHealth(snapshot,fingerprint,sourceCount,now=Date.now(),maxAgeMs=300000){
    if(typeof fingerprint!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(fingerprint)||!Number.isSafeInteger(sourceCount)||sourceCount<0||!Number.isFinite(now)||now<0||!Number.isFinite(maxAgeMs)||maxAgeMs<60000)return null;
    if(!snapshot||snapshot.version!==1||snapshot.fingerprint!==fingerprint.toLowerCase()||!Number.isFinite(snapshot.savedAt)||snapshot.savedAt>now+5000||now-snapshot.savedAt>maxAgeMs||!Array.isArray(snapshot.sources)||snapshot.sources.length!==sourceCount)return null;
    if(snapshot.sources.some(item=>!item||!Number.isSafeInteger(item.failures)||item.failures<0||item.failures>2||!Number.isFinite(item.quarantinedUntil)||item.quarantinedUntil<0||item.quarantinedUntil>snapshot.savedAt+60000))return null;
    return Object.freeze(snapshot.sources.map(item=>item.quarantinedUntil>now?Object.freeze({failures:item.failures,quarantinedUntil:item.quarantinedUntil}):Object.freeze({failures:item.quarantinedUntil?0:item.failures,quarantinedUntil:0})));
  }
  root.LQCChartHealth=Object.freeze({classify,chainSync,consensusHead,consensusHash,sourceHealth,sourceHealthSnapshot,restoreSourceHealth});
})(typeof window==='undefined'?globalThis:window);
