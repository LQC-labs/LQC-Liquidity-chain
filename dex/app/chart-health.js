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
  root.LQCChartHealth=Object.freeze({classify,chainSync});
})(typeof window==='undefined'?globalThis:window);
