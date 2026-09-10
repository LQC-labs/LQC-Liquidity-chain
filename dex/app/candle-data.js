(function(root){
  'use strict';
  const intervals=Object.freeze({"1m":60,"3m":180,"5m":300,"15m":900,"1h":3600,"4h":14400,"1D":86400,"1W":604800,"1M":2592000});
  function normalize(raw){
    const rows=Array.isArray(raw)?raw:Array.isArray(raw?.candles)?raw.candles:[];
    const byTime=new Map();
    for(const item of rows){
      const candle=Array.isArray(item)?{time:item[0],open:item[1],high:item[2],low:item[3],close:item[4],volume:item[5]}:item;
      const value={time:Number(candle?.time),open:Number(candle?.open),high:Number(candle?.high),low:Number(candle?.low),close:Number(candle?.close),volume:Number(candle?.volume||0)};
      if(!Number.isFinite(value.time)||![value.open,value.high,value.low,value.close,value.volume].every(Number.isFinite))continue;
      if(value.time<=0||value.open<=0||value.close<=0||value.volume<0||value.high<Math.max(value.open,value.close)||value.low>Math.min(value.open,value.close)||value.low<=0)continue;
      byTime.set(value.time,value);
    }
    return [...byTime.values()].sort((a,b)=>a.time-b.time).slice(-300);
  }
  function requestUrl(baseUrl,{chainId,base,quote,timeframe,limit=120}){
    if(!intervals[timeframe])throw new Error('Unsupported candle timeframe');
    const url=new URL(baseUrl,root.location?.href||'http://localhost/');
    for(const [key,value] of Object.entries({chainId,base,quote,timeframe,limit:Math.min(300,Math.max(20,Number(limit)||120))}))url.searchParams.set(key,String(value));
    return url.toString();
  }
  async function load(baseUrl,params,{fetcher=root.fetch,timeoutMs=8000}={}){
    if(!baseUrl)return [];
    const controller=typeof AbortController==='function'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
    try{
      const response=await fetcher(requestUrl(baseUrl,params),{headers:{accept:'application/json'},signal:controller?.signal});
      if(!response.ok)throw new Error(`Candle service returned ${response.status}`);
      const candles=normalize(await response.json());
      if(candles.length<2)throw new Error('Candle history is incomplete');
      return candles;
    }finally{if(timer)clearTimeout(timer)}
  }
  root.LQCCandleData=Object.freeze({intervals,normalize,requestUrl,load});
})(typeof window==='undefined'?globalThis:window);
