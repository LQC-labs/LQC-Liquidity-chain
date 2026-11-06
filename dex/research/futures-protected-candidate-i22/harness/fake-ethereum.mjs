import { POSITION_PROFILE } from "../dex/app/futures/mobile-testnet-position-config.js";
const W=10n**18n;
const encode=(method,args)=>"0x"+Array.from(new TextEncoder().encode(JSON.stringify({method,args:args.map(x=>typeof x==="bigint"?x.toString():x)}))).map(x=>x.toString(16).padStart(2,"0")).join("");
const decode=s=>JSON.parse(new TextDecoder().decode(Uint8Array.from(s.slice(2).match(/../g).map(x=>parseInt(x,16)))));
const parseUnits=(s,d)=>{const [a,b=""]=String(s).split(".");return BigInt(a)*10n**BigInt(d)+BigInt((b+"0".repeat(d)).slice(0,d));};
const formatUnits=(n,d)=>{const negative=n<0n;if(negative)n=-n;const div=10n**BigInt(d),tail=(n%div).toString().padStart(d,"0").replace(/0+$/,"");return (negative?"-":"")+n/div+(tail?"."+tail:".0");};
function fakeDocument(){
 const elements=new Map();
 for(const id of["s","mode","balances","check","close","reduce","open","reduceSize"])elements.set(id,{id,textContent:"",className:"",disabled:true,value:id==="reduceSize"?"1250":"",dataset:{},handlers:{},addEventListener(e,f){this.handlers[e]=f;}});
 return {elements,hidden:false,events:{},getElementById:id=>elements.get(id),addEventListener(e,f){this.events[e]=f;}};
}
export function makeHarness({kind="exit",mode=1,truth,doc=null,settings={}}={}) {
 const synthetic=n=>'0x'+n.toString(16).padStart(40,'0');
 const profile={...POSITION_PROFILE,engine:synthetic(1001),registry:synthetic(1002),vault:synthetic(1003),oracle:synthetic(1004),indexToken:synthetic(1005),collateral:synthetic(1006),trader:synthetic(1007),reviewOnly:false,receiptAttempts:2,receiptDelay:0,...settings.profile};
 const model={mode,ready:true,verified:true,protected:true,vaultProtected:true,backed:true,supported:true,badDebt:0n,chain:profile.chainId,account:profile.trader,price:50000n*W,updated:1000n,now:1000n,open:kind!=="open",size:kind==="open"?0n:5000n*W,margin:kind==="open"?0n:1000n*W,avail:kind==="open"?5000n*W:4000n*W,locked:kind==="open"?0n:1000n*W,free:kind==="open"?5000n*W:4000n*W,payable:0n,calls:[],submitted:[],events:new Map(),providerEvents:new Map(),ethEvents:new Map(),receipts:new Map(),...settings.model};
 const document=doc??fakeDocument(),emit=(map,name,...args)=>{for(const f of map.get(name)??[])f(...args);},listen=(map,name,fn)=>map.set(name,[...(map.get(name)??[]),fn]);
 const pos=()=>({open:model.open,sizeUsd:model.size,margin:model.margin,entryPrice:50000n*W,isLong:true});
 function assess(data) {
  const {method,args}=decode(data),action=method==="openPosition"?"open":method==="reducePosition"?"partial":"close";
  if(model.estimateError)throw Error(model.estimateError);
  if(!truth.cases[String(model.mode)][action])throw Error("Engine: MarketInactive");
  if(model.oracleError||model.now-model.updated>300n)throw Error("Engine: OracleFailure");
  if(action==="open"){if(!model.ready||model.open)throw Error("Engine: admission rejected");if(model.free<BigInt(args[1]))throw Error("Engine: InsufficientUnencumberedCollateral");}
  else{if(!model.open)throw Error("Engine: PositionNotFound");if(model.payable>0n)throw Error("Engine: LedgerDebtOutstanding");if(action==="partial"&&model.lossBadDebt)throw Error("Engine: PartialReductionWouldCreateBadDebt");}
  return {method,args,action};
 }
 function settle(plan) {
  if(plan.action==="open"){model.open=true;model.margin=BigInt(plan.args[1]);model.size=BigInt(plan.args[2]);model.avail-=model.margin;model.locked+=model.margin;}
  else{const reduction=plan.action==="close"?model.size:BigInt(plan.args[1]),release=model.margin*reduction/model.size;model.size-=reduction;model.margin-=release;model.avail+=release;model.locked-=release;model.open=model.size!==0n;}model.free=model.avail;
 }
 const ethereum={on:(name,f)=>listen(model.ethEvents,name,f),async request({method,params=[]}){
  model.calls.push({method,params});
  if(method==="eth_chainId")return model.chain;
  if(method==="eth_accounts"||method==="eth_requestAccounts")return [model.account];
  if(method==="eth_getCode")return model.missingCode==="all"||model.missingCode===params[0]?"0x":"0x6000";
  if(method==="eth_estimateGas"){const p=assess(params[0].data);if(model.onEstimate)await model.onEstimate(p);return "0xf4240";}
  if(method==="eth_sendTransaction"){if(model.sendError)throw Error(model.sendError);const plan=assess(params[0].data),hash="0x"+String(model.submitted.length+1).padStart(64,"0");model.submitted.push(params[0]);model.receipts.set(hash,{plan,applied:false});return hash;}
  if(method==="eth_getTransactionReceipt"){if(model.receiptPending)return null;const x=model.receipts.get(params[0]);if(!x)return null;if(model.receiptFailed)return {status:"0x0"};if(!x.applied){settle(x.plan);x.applied=true;}return {status:"0x1"};}
  throw Error("UNEXPECTED MOCK RPC: "+method);
 }};
 const ethers={
  parseUnits,formatUnits,
  BrowserProvider:class{async getBlock(){return {timestamp:Number(model.now),number:100};}on(name,f){listen(model.providerEvents,name,f);return Promise.resolve();}},
  Contract:class{
   constructor(address){
    const a=address.toLowerCase(),is=x=>a===x.toLowerCase();
    this.interface={encodeFunctionData:encode};this.on=(name,f)=>{listen(model.events,name,f);return Promise.resolve();};
    const value=(name,normal)=>async()=>{if(model.throwGetter===name)throw Error("getter failed: "+name);return model[name]??normal;};
    if(is(profile.engine)){this.registry=value("engineRegistry",profile.registry);this.vault=value("engineVault",profile.vault);this.fundingProtectionReady=value("protected",true);this.positions=async()=>pos();this.getPositionPnl=async()=>[0n,model.price];}
    else if(is(profile.registry)){this.riskEngine=value("riskEngine",profile.engine);this.riskVault=value("riskVault",profile.vault);this.verifiedResidualDebt=async()=>[model.verified,model.badDebt];this.marketMode=value("mode",mode);this.liquidationReady=async()=>model.ready&&model.mode!==2&&model.supported&&model.backed;this.markets=async()=>({indexToken:model.indexToken??profile.indexToken,collateralToken:model.collateral??profile.collateral,oracle:model.oracle??profile.oracle,maxLeverageBps:100000n,active:model.activeOverride??(model.mode===0&&model.ready&&model.badDebt===0n)});}
    else if(is(profile.vault)){this.engine=value("vaultEngine",profile.engine);this.fundingWithdrawalProtection=value("vaultProtected",true);this.availableBalance=value("avail",model.avail);this.lockedBalance=value("locked",model.locked);this.withdrawableBalance=value("free",model.free);}
    else if(is(profile.oracle))this.getPrice=async()=>{if(model.oracleError)throw Error("Oracle: reference unavailable");return [model.price,model.updated];};
    else throw Error("unknown mock address");
   }
  }
 };
 const intervals=[];const env={document,ethereum,ethers,setTimeout:f=>{f();return 0;},setInterval:f=>{intervals.push(f);return intervals.length-1;},clearInterval:i=>{intervals[i]=null;}};
 function setMode(n){model.mode=n;emit(model.events,"MarketModeChanged",profile.market,0,n);}
 return {profile,model,env,document,ethers,ethereum,setMode,block:()=>emit(model.providerEvents,"block",101),accountChanged:a=>{model.account=a;emit(model.ethEvents,"accountsChanged",[a]);},chainChanged:a=>{model.chain=a;emit(model.ethEvents,"chainChanged",a);},intervals};
}

