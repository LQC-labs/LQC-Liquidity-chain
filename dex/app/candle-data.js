(function(root){
  'use strict';
  const intervals=Object.freeze({"1m":60,"3m":180,"5m":300,"15m":900,"1h":3600,"4h":14400,"1D":86400,"1W":604800,"1M":2592000});
  class CandleWatermarks{
    constructor(maxMarkets=200,{storage=null,storageKey='lqc:candle-watermarks:v1'}={}){
      if(!Number.isInteger(maxMarkets)||maxMarkets<1)throw new Error('Candle watermark limit is invalid');this.maxMarkets=maxMarkets;this.values=new Map();this.storage=storage;this.storageKey=storageKey;this.restore();
    }
    valid(entry){return entry&&['cursor','finalizedBlock','issuedAt'].every(key=>Number.isSafeInteger(entry[key])&&entry[key]>=0)&&typeof entry.digest==='string'&&entry.digest.length>0}
    restore(){
      try{const saved=JSON.parse(this.storage?.getItem(this.storageKey)||'[]');if(!Array.isArray(saved))return;for(const item of saved.slice(-this.maxMarkets)){if(Array.isArray(item)&&typeof item[0]==='string'&&item[0].length<=256&&this.valid(item[1]))this.values.set(item[0],item[1])}}catch{}
    }
    persist(){try{this.storage?.setItem(this.storageKey,JSON.stringify([...this.values]))}catch{}}
    accept(payload,digest){
      const key=`${payload.chainId}:${payload.base}:${payload.quote}:${payload.timeframe}`,current=this.values.get(key),next={cursor:payload.cursor,finalizedBlock:payload.finalizedBlock,issuedAt:payload.issuedAt,digest:String(digest).toLowerCase()};
      if(!this.valid(next))throw new Error('Candle watermark is invalid');
      if(current&&(next.cursor<current.cursor||next.finalizedBlock<current.finalizedBlock||next.issuedAt<current.issuedAt))throw new Error('Candle data replay or rollback detected');
      if(current&&next.cursor===current.cursor&&next.finalizedBlock===current.finalizedBlock&&next.issuedAt===current.issuedAt&&next.digest!==current.digest)throw new Error('Conflicting candle data revision detected');
      this.values.delete(key);this.values.set(key,next);if(this.values.size>this.maxMarkets)this.values.delete(this.values.keys().next().value);this.persist();return true;
    }
  }
  function sessionStore(){try{return root.sessionStorage||null}catch{return null}}
  const defaultWatermarks=new CandleWatermarks(200,{storage:sessionStore()});
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
  function signedPayload(raw){return{chainId:Number(raw?.chainId),base:String(raw?.base||'').toLowerCase(),quote:String(raw?.quote||'').toLowerCase(),timeframe:raw?.timeframe,candles:raw?.candles,issuedAt:Number(raw?.issuedAt),expiresAt:Number(raw?.expiresAt),cursor:Number(raw?.cursor),finalizedBlock:Number(raw?.finalizedBlock)}}
  function verify(raw,expectedSigner,ethersLib=root.ethers,now=Math.floor(Date.now()/1000)){
    try{if(!ethersLib?.isAddress(expectedSigner)||raw?.proof?.scheme!=='EIP-191')return false;const payload=signedPayload(raw),digest=ethersLib.keccak256(ethersLib.toUtf8Bytes(JSON.stringify(payload)));if(digest.toLowerCase()!==String(raw.proof.digest).toLowerCase()||now>payload.expiresAt||now<payload.issuedAt-30)return false;return ethersLib.verifyMessage(ethersLib.getBytes(digest),raw.proof.signature).toLowerCase()===expectedSigner.toLowerCase()&&String(raw.proof.signer).toLowerCase()===expectedSigner.toLowerCase()}catch{return false}
  }
  async function load(baseUrl,params,{fetcher=root.fetch,timeoutMs=8000,expectedSigner='',ethersLib=root.ethers,watermarks=defaultWatermarks}={}){
    if(!baseUrl)return [];
    const controller=typeof AbortController==='function'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
    try{
      const response=await fetcher(requestUrl(baseUrl,params),{headers:{accept:'application/json'},signal:controller?.signal});
      if(!response.ok)throw new Error(`Candle service returned ${response.status}`);
      const raw=await response.json();if(!verify(raw,expectedSigner,ethersLib))throw new Error('Candle data signature is invalid');
      const payload=signedPayload(raw);if(payload.chainId!==Number(params.chainId)||payload.base!==String(params.base).toLowerCase()||payload.quote!==String(params.quote).toLowerCase()||payload.timeframe!==params.timeframe)throw new Error('Candle data context is invalid');
      const candles=normalize(payload.candles);
      if(candles.length<2)throw new Error('Candle history is incomplete');
      if(!watermarks||typeof watermarks.accept!=='function')throw new Error('Candle watermark policy is invalid');
      watermarks.accept(payload,raw.proof.digest);
      return candles;
    }finally{if(timer)clearTimeout(timer)}
  }
  root.LQCCandleData=Object.freeze({intervals,normalize,requestUrl,verify,CandleWatermarks,load});
})(typeof window==='undefined'?globalThis:window);
