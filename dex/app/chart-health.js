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
  function rankCanonicalSources(observations,canonicalHead,canonicalHash,maxSpread=3){
    if(!Array.isArray(observations)||!Number.isSafeInteger(canonicalHead)||canonicalHead<0||typeof canonicalHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(canonicalHash)||!Number.isSafeInteger(maxSpread)||maxSpread<0||observations.some(item=>!item||!Number.isSafeInteger(item.index)||item.index<0||!Number.isSafeInteger(item.head)||item.head<0||!Number.isFinite(item.latencyMs)||item.latencyMs<0||typeof item.blockHash!=='string')||new Set(observations.map(item=>item.index)).size!==observations.length)throw new Error('Chart RPC source ranking input is invalid');
    const hash=canonicalHash.toLowerCase();return Object.freeze(observations.filter(item=>item.head>=canonicalHead&&item.head<=canonicalHead+maxSpread&&item.blockHash.toLowerCase()===hash).sort((a,b)=>a.latencyMs-b.latencyMs||a.index-b.index).map(item=>item.index));
  }
  function consensusQuote(observations,configuredSources){
    if(!Array.isArray(observations)||!Number.isSafeInteger(configuredSources)||configuredSources<1||configuredSources<observations.length||observations.some(item=>!item||!Number.isSafeInteger(item.index)||item.index<0||!item.quote||typeof item.quote.dexId!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(item.quote.dexId)||typeof item.quote.adapter!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(item.quote.adapter)||typeof item.quote.amountOut!=='bigint'||item.quote.amountOut<=0n||!['bigint','number'].includes(typeof item.quote.priority))||new Set(observations.map(item=>item.index)).size!==observations.length)throw new Error('Chart RPC quote consensus input is invalid');
    const groups=new Map();for(const item of observations){const quote=item.quote,key=[quote.dexId.toLowerCase(),quote.adapter.toLowerCase(),quote.amountOut.toString(),BigInt(quote.priority).toString()].join(':');const group=groups.get(key)||[];group.push(item);groups.set(key,group)}
    const winner=[...groups.values()].sort((a,b)=>b.length-a.length)[0]||[],quorum=Math.floor(configuredSources/2)+1;if(winner.length<quorum)return null;const quote=winner[0].quote;
    return Object.freeze({dexId:quote.dexId.toLowerCase(),adapter:quote.adapter.toLowerCase(),amountOut:quote.amountOut,priority:BigInt(quote.priority),sourceIndexes:Object.freeze(winner.map(item=>item.index))});
  }
  function bindQuote(quote,blockNumber,blockHash,issuedAt=Date.now(),ttlMs=10000){
    if(!quote||typeof quote.dexId!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(quote.dexId)||typeof quote.adapter!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(quote.adapter)||typeof quote.amountOut!=='bigint'||quote.amountOut<=0n||!['bigint','number'].includes(typeof quote.priority)||!Number.isSafeInteger(blockNumber)||blockNumber<0||typeof blockHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(blockHash)||!Number.isFinite(issuedAt)||issuedAt<0||!Number.isFinite(ttlMs)||ttlMs<1000||ttlMs>30000)throw new Error('Chart RPC quote binding input is invalid');
    return Object.freeze({...quote,dexId:quote.dexId.toLowerCase(),adapter:quote.adapter.toLowerCase(),priority:BigInt(quote.priority),blockNumber,blockHash:blockHash.toLowerCase(),issuedAt,expiresAt:issuedAt+ttlMs});
  }
  function quoteBindingMatches(bound,quote,blockHash,now=Date.now()){
    if(!bound||!quote||!Number.isFinite(now)||typeof blockHash!=='string'||!['bigint','number'].includes(typeof quote.priority))return false;return now>=bound.issuedAt&&now<=bound.expiresAt&&blockHash.toLowerCase()===bound.blockHash&&quote.dexId?.toLowerCase()===bound.dexId&&quote.adapter?.toLowerCase()===bound.adapter&&quote.amountOut===bound.amountOut&&BigInt(quote.priority)===bound.priority;
  }
  function normalizeQuoteRequest(request){
    if(!request||!Number.isSafeInteger(request.chainId)||request.chainId<1||typeof request.router!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(request.router)||typeof request.tokenIn!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(request.tokenIn)||typeof request.tokenOut!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(request.tokenOut)||request.tokenIn.toLowerCase()===request.tokenOut.toLowerCase()||typeof request.amountIn!=='bigint'||request.amountIn<=0n||!Array.isArray(request.routes)||request.routes.length<1||request.routes.length>32||request.routes.some(route=>typeof route!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(route))||!Number.isSafeInteger(request.slippageBps)||request.slippageBps<0||request.slippageBps>5000)throw new Error('Chart RPC quote request input is invalid');
    return Object.freeze({chainId:request.chainId,router:request.router.toLowerCase(),tokenIn:request.tokenIn.toLowerCase(),tokenOut:request.tokenOut.toLowerCase(),amountIn:request.amountIn,routes:Object.freeze(request.routes.map(route=>route.toLowerCase())),slippageBps:request.slippageBps});
  }
  function bindQuoteRequest(bound,request){if(!bound||!Number.isFinite(bound.expiresAt))throw new Error('Chart RPC quote request binding is invalid');return Object.freeze({...bound,request:normalizeQuoteRequest(request)})}
  function quoteRequestMatches(bound,request){try{const expected=bound?.request,actual=normalizeQuoteRequest(request);return Boolean(expected)&&expected.chainId===actual.chainId&&expected.router===actual.router&&expected.tokenIn===actual.tokenIn&&expected.tokenOut===actual.tokenOut&&expected.amountIn===actual.amountIn&&expected.slippageBps===actual.slippageBps&&expected.routes.length===actual.routes.length&&expected.routes.every((route,index)=>route===actual.routes[index])}catch{return false}}
  function normalizeExecutionPlan(plan){
    if(!plan||typeof plan.sender!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(plan.sender)||typeof plan.recipient!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(plan.recipient)||typeof plan.router!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(plan.router)||typeof plan.minimumAmountOut!=='bigint'||plan.minimumAmountOut<=0n||!Number.isSafeInteger(plan.deadline)||plan.deadline<1||!['native-in','native-out','single','split'].includes(plan.kind))throw new Error('Chart execution plan input is invalid');
    return Object.freeze({sender:plan.sender.toLowerCase(),recipient:plan.recipient.toLowerCase(),router:plan.router.toLowerCase(),minimumAmountOut:plan.minimumAmountOut,deadline:plan.deadline,kind:plan.kind});
  }
  function bindExecutionPlan(bound,plan){if(!bound?.request)throw new Error('Chart execution plan binding is invalid');return Object.freeze({...bound,execution:normalizeExecutionPlan(plan)})}
  function executionPlanMatches(bound,plan,nowSeconds=Math.floor(Date.now()/1000)){try{const expected=bound?.execution,actual=normalizeExecutionPlan(plan);return Boolean(expected)&&Number.isSafeInteger(nowSeconds)&&nowSeconds<=actual.deadline&&expected.sender===actual.sender&&expected.recipient===actual.recipient&&expected.router===actual.router&&expected.minimumAmountOut===actual.minimumAmountOut&&expected.deadline===actual.deadline&&expected.kind===actual.kind}catch{return false}}
  root.LQCChartHealth=Object.freeze({classify,chainSync,consensusHead,consensusHash,sourceHealth,sourceHealthSnapshot,restoreSourceHealth,rankCanonicalSources,consensusQuote,bindQuote,quoteBindingMatches,bindQuoteRequest,quoteRequestMatches,bindExecutionPlan,executionPlanMatches});
})(typeof window==='undefined'?globalThis:window);
