(function(){
"use strict";
const FACTORY="0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const CHAIN="0x61";
const FEES=[100,500,2500,10000];
const $=id=>document.getElementById(id);
const iface=new ethers.Interface([
 "function getPool(address,address,uint24) view returns(address)"
]);
const poolAbi=[
 "function token0() view returns(address)",
 "function token1() view returns(address)",
 "function liquidity() view returns(uint128)",
 "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)",
 "function observe(uint32[] secondsAgos) view returns(int56[],uint160[])"
];
async function req(method,params=[]){
 if(!window.ethereum)throw Error("TokenPocket DApp 브라우저에서 열어주세요.");
 return window.ethereum.request({method,params});
}
async function call(to,abi,fn,args=[]){
 const i=new ethers.Interface(abi),data=i.encodeFunctionData(fn,args);
 const raw=await req("eth_call",[{to,data},"latest"]);
 return i.decodeFunctionResult(fn,raw);
}
function validAddress(x,label){
 if(!ethers.isAddress(x))throw Error(label+" 주소가 올바르지 않습니다.");
 const a=ethers.getAddress(x);
 if(a===ethers.ZeroAddress)throw Error(label+"는 0 주소일 수 없습니다.");
 return a;
}
async function inspect(pool,indexToken,quoteToken,window){
 if(await req("eth_getCode",[pool,"latest"])==="0x")return {pool,ready:false,reason:"no runtime code"};
 const [t0,t1,liq,slot]=await Promise.all([
   call(pool,poolAbi,"token0"),call(pool,poolAbi,"token1"),
   call(pool,poolAbi,"liquidity"),call(pool,poolAbi,"slot0")
 ]);
 const token0=ethers.getAddress(t0[0]),token1=ethers.getAddress(t1[0]);
 if(![token0,token1].includes(indexToken)||![token0,token1].includes(quoteToken))return {pool,ready:false,reason:"token pair mismatch"};
 if(liq[0]===0n)return {pool,ready:false,reason:"liquidity=0",liquidity:"0",observationCardinality:Number(slot[3])};
 if(slot[0]===0n||slot[6]!==true)return {pool,ready:false,reason:"pool not initialized/unlocked",liquidity:liq[0].toString(),observationCardinality:Number(slot[3])};
 if(Number(slot[3])<2)return {pool,ready:false,reason:"observationCardinality<2",liquidity:liq[0].toString(),observationCardinality:Number(slot[3])};
 try{await call(pool,poolAbi,"observe",[[window,0]])}
 catch(e){return {pool,ready:false,reason:"TWAP observe failed for "+window+"s",liquidity:liq[0].toString(),observationCardinality:Number(slot[3])}}
 return {pool,ready:true,reason:"READY",liquidity:liq[0].toString(),observationCardinality:Number(slot[3])};
}
async function run(){
 const out=$("result");out.textContent="검증 중…";
 try{
  if((await req("eth_chainId")).toLowerCase()!==CHAIN)throw Error("BSC Testnet(chain 97)이 아닙니다.");
  if(await req("eth_getCode",[FACTORY,"latest"])==="0x")throw Error("Pancake V3 Factory runtime code를 확인할 수 없습니다.");
  const indexToken=validAddress($("indexToken").value,"Index Token");
  const quoteToken=validAddress($("quoteToken").value,"Quote Token");
  if(indexToken===quoteToken)throw Error("Index/Quote Token은 서로 달라야 합니다.");
  const window=Number($("window").value);
  if(!Number.isInteger(window)||window<300||window>86400)throw Error("TWAP window는 300~86400초여야 합니다.");
  const rows=[];
  for(const fee of FEES){
    const data=iface.encodeFunctionData("getPool",[indexToken,quoteToken,fee]);
    const raw=await req("eth_call",[{to:FACTORY,data},"latest"]);
    const pool=ethers.getAddress(iface.decodeFunctionResult("getPool",raw)[0]);
    if(pool===ethers.ZeroAddress){rows.push({fee,pool,ready:false,reason:"pool not found"});continue}
    rows.push({fee,...await inspect(pool,indexToken,quoteToken,window)});
  }
  const ready=rows.filter(x=>x.ready);
  out.textContent=JSON.stringify({chainId:97,factory:FACTORY,indexToken,quoteToken,window,readyPools:ready,allPools:rows},null,2);
  $("status").textContent=ready.length?"TWAP-ready 후보를 찾았습니다. readyPools 주소만 사용하세요.":"현재 조건을 만족하는 TWAP-ready 풀이 없습니다.";
  $("status").dataset.type=ready.length?"ok":"error";
 }catch(e){out.textContent="";$("status").textContent=e.message||String(e);$("status").dataset.type="error"}
}
$("run").onclick=run;
$("factory").textContent=FACTORY;
})();