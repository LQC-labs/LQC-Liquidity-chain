import { ethers } from "ethers";

const PYTH="0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb";
const BNB_USD_ID="0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";
const CHAINLINK="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const MAX_AGE=3600;

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
if((await provider.getNetwork()).chainId!==97n) throw new Error("Expected BSC Testnet chain 97");
if(await provider.getCode(PYTH)==="0x") throw new Error("Pyth contract has no runtime code.");

const pyth=new ethers.Contract(PYTH,[
 "function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price,uint64 conf,int32 expo,uint256 publishTime))",
 "function getPriceNoOlderThan(bytes32 id,uint256 age) view returns (tuple(int64 price,uint64 conf,int32 expo,uint256 publishTime))"
],provider);
const chainlink=new ethers.Contract(CHAINLINK,[
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
],provider);

function scaleTo18(price,expo){
 const p=BigInt(price);
 if(p<=0n) throw new Error("Pyth price <= 0");
 if(expo>=0) return p*(10n**BigInt(expo+18));
 const d=-expo;
 return d<=18 ? p*(10n**BigInt(18-d)) : p/(10n**BigInt(d-18));
}
function deviationBps(a,b){
 const d=a>b?a-b:b-a;
 return (d*10000n)/b;
}

const [unsafe,clDec,clRound]=await Promise.all([
 pyth.getPriceUnsafe(BNB_USD_ID),
 chainlink.decimals(),
 chainlink.latestRoundData()
]);

let fresh={ok:false};
try{
 const r=await pyth.getPriceNoOlderThan(BNB_USD_ID,MAX_AGE);
 fresh={ok:true,price:r.price.toString(),conf:r.conf.toString(),expo:Number(r.expo),publishTime:r.publishTime.toString()};
}catch(e){
 fresh={ok:false,error:e.shortMessage||e.message||String(e),data:e?.data||e?.error?.data||e?.info?.error?.data||null};
}

const pyth18=scaleTo18(unsafe.price,Number(unsafe.expo));
const clRaw=BigInt(clRound[1]);
const cl18=Number(clDec)===18?clRaw:Number(clDec)<18?clRaw*10n**BigInt(18-Number(clDec)):clRaw/10n**BigInt(Number(clDec)-18);
const dev=deviationBps(pyth18,cl18);

console.log(JSON.stringify({
 status:"PYTH_BNB_READONLY_VALIDATION",
 chainId:97,
 pythContract:PYTH,
 feedId:BNB_USD_ID,
 runtimeCode:true,
 unsafe:{
   price:unsafe.price.toString(),
   conf:unsafe.conf.toString(),
   expo:Number(unsafe.expo),
   publishTime:unsafe.publishTime.toString(),
   normalized18:pyth18.toString()
 },
 fresh,
 chainlink:{
   raw:clRaw.toString(),
   decimals:Number(clDec),
   updatedAt:clRound[3].toString(),
   normalized18:cl18.toString()
 },
 deviationBps:dev.toString(),
 within500Bps:dev<=500n,
 adapterImplementationReady:fresh.ok&&dev<=500n
},null,2));
