import { ethers } from "ethers";

const FEED_ID="2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";
const CHAINLINK="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const HERMES="https://hermes.pyth.network/v2/updates/price/latest";

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
if((await provider.getNetwork()).chainId!==97n) throw new Error("Expected BSC Testnet chain 97");

const url=HERMES+"?ids%5B%5D=0x"+FEED_ID;
const response=await fetch(url,{headers:{"accept":"application/json"}});
if(!response.ok) throw new Error("Hermes HTTP "+response.status);
const data=await response.json();
if(!Array.isArray(data.parsed)||data.parsed.length<1) throw new Error("Hermes parsed price missing.");
const p=data.parsed[0].price;
const price=BigInt(p.price);
const expo=Number(p.expo);
const publishTime=BigInt(p.publish_time);
if(price<=0n) throw new Error("Hermes BNB price <= 0");

function to18(v,e){
 if(e>=0)return v*10n**BigInt(e+18);
 const d=-e;
 return d<=18?v*10n**BigInt(18-d):v/10n**BigInt(d-18);
}
function bps(a,b){const d=a>b?a-b:b-a;return d*10000n/b;}

const hermes18=to18(price,expo);
const cl=new ethers.Contract(CHAINLINK,[
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
],provider);
const [dec,round]=await Promise.all([cl.decimals(),cl.latestRoundData()]);
const raw=BigInt(round[1]);
const cl18=Number(dec)===18?raw:Number(dec)<18?raw*10n**BigInt(18-Number(dec)):raw/10n**BigInt(Number(dec)-18);
const dev=bps(hermes18,cl18);

const now=BigInt(Math.floor(Date.now()/1000));
const age=now>publishTime?now-publishTime:0n;

console.log(JSON.stringify({
 status:"PYTH_HERMES_FRESH_VALIDATION",
 feedId:"0x"+FEED_ID,
 hermes:{
   price:price.toString(),
   expo,
   publishTime:publishTime.toString(),
   ageSeconds:age.toString(),
   normalized18:hermes18.toString(),
   binaryUpdateCount:Array.isArray(data.binary?.data)?data.binary.data.length:0
 },
 chainlink:{
   raw:raw.toString(),
   decimals:Number(dec),
   updatedAt:round[3].toString(),
   normalized18:cl18.toString()
 },
 deviationBps:dev.toString(),
 within500Bps:dev<=500n,
 freshEnough:age<=120n,
 pullOracleArchitectureReady:dev<=500n&&age<=120n&&(Array.isArray(data.binary?.data)&&data.binary.data.length>0)
},null,2));