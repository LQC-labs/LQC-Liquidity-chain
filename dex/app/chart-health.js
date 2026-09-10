(function(root){
  'use strict';
  function classify({latencyMs=0,ageSeconds=0,consecutiveFailures=0,online=true}={}){
    if(typeof online!=='boolean'||!Number.isFinite(latencyMs)||latencyMs<0||!Number.isFinite(ageSeconds)||ageSeconds<0||!Number.isInteger(consecutiveFailures)||consecutiveFailures<0)throw new Error('Chart health input is invalid');
    if(!online)return Object.freeze({level:'interrupted',label:'연결 중단',retry:true});
    if(consecutiveFailures>=3)return Object.freeze({level:'interrupted',label:'연결 중단',retry:true});
    if(consecutiveFailures>0||latencyMs>1500||ageSeconds>15)return Object.freeze({level:'delayed',label:'연결 지연',retry:true});
    return Object.freeze({level:'healthy',label:'실시간 정상',retry:false});
  }
  root.LQCChartHealth=Object.freeze({classify});
})(typeof window==='undefined'?globalThis:window);
