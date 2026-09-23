import { ethers } from "ethers";

const INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const QUOTE="0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const FEED="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const FACTORIES=[
 {label:"V2_A",address:"0x6725F303b657a9451d8BA641348b6761A6CC7a17"},
 {label:"V2_B",address:"0xb7926c0430afb07aa7defde6da862ae0bde767bc"}
];

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
if((await provider.getNetwork()).chainId!==97n) throw new Error("Expected BSC Testnet chain 97");

const agg=new ethers.Contract(FEED,[
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
],provider);
const [fd,round]=await Promise.all([agg.decimals(),agg.latestRoundData()]);
const primaryRaw=BigInt(round[1]);
const primary18=Number(fd)===18?primaryRaw:
 Number(fd)<18?primaryRaw*10n**BigInt(18-Number(fd)):
 primaryRaw/10n**BigInt(Number(fd)-18);

const factoryAbi=["function getPair(address,address) view returns(address)"];
const pairAbi=[
 "function token0() view returns(address)",
 "function token1() view returns(address)",
 "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
 "function price0CumulativeLast() view returns(uint256)",
 "function price1CumulativeLast() view returns(uint256)"
];

function bps(a,b){const d=a>b?a-b:b-a;return (d*10000n)/b;}

const results=[];
for(const f of FACTORIES){
 const code=await provider.getCode(f.address);
 if(code==="0x"){results.push({...f,factoryCode:false});continue;}
 const factory=new ethers.Contract(f.address,factoryAbi,provider);
 const pair=ethers.getAddress(await factory.getPair(INDEX,QUOTE));
 if(pair===ethers.ZeroAddress){results.push({...f,factoryCode:true,pair,exists:false});continue;}
 const p=new ethers.Contract(pair,pairAbi,provider);
 const [token0,token1,reserves,p0,p1]=await Promise.all([
   p.token0(),p.token1(),p.getReserves(),p.price0CumulativeLast(),p.price1CumulativeLast()
 ]);
 const r0=BigInt(reserves[0]),r1=BigInt(reserves[1]);
 let spot18=0n;
 if(r0>0n&&r1>0n){
   if(ethers.getAddress(token0)===ethers.getAddress(INDEX)) spot18=(r1*10n**18n)/r0;
   else spot18=(r0*10n**18n)/r1;
 }
 results.push({
   ...f,factoryCode:true,pair,exists:true,token0,token1,
   reserve0:r0.toString(),reserve1:r1.toString(),
   blockTimestampLast:Number(reserves[2]),
   price0CumulativeLast:p0.toString(),price1CumulativeLast:p1.toString(),
   spotPrice18:spot18.toString(),
   spotDeviationBps:spot18>0n?bps(spot18,primary18).toString():null
 });
}
console.log(JSON.stringify({
 status:"V2_REFERENCE_PAIR_DISCOVERY",
 chainId:97,
 primary:{raw:primaryRaw.toString(),decimals:Number(fd),normalized18:primary18.toString()},
 index:INDEX,quote:QUOTE,
 results
},null,2));