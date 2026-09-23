import { ethers } from "ethers";

const WBNB="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const CHAINLINK="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const VENUS_BINANCE="0xB58BFDCE610042311Dc0e034a80Cc7776c1D68f5";

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
if((await provider.getNetwork()).chainId!==97n) throw new Error("Expected BSC Testnet chain 97");
if(await provider.getCode(VENUS_BINANCE)==="0x") throw new Error("Venus Binance Oracle has no runtime code.");

const oracle=new ethers.Contract(VENUS_BINANCE,[
  "function getPrice(address asset) view returns(uint256)"
],provider);
const chainlink=new ethers.Contract(CHAINLINK,[
  "function decimals() view returns(uint8)",
  "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
],provider);

function deviationBps(a,b){const d=a>b?a-b:b-a;return (d*10000n)/b;}

const [binancePrice,clDec,clRound]=await Promise.all([
  oracle.getPrice(WBNB),
  chainlink.decimals(),
  chainlink.latestRoundData()
]);

const bp=BigInt(binancePrice);
if(bp<=0n) throw new Error("Binance Oracle price <= 0");
const clRaw=BigInt(clRound[1]);
if(clRaw<=0n) throw new Error("Chainlink price <= 0");
const cl18=Number(clDec)===18?clRaw:
 Number(clDec)<18?clRaw*10n**BigInt(18-Number(clDec)):
 clRaw/10n**BigInt(Number(clDec)-18);
const dev=deviationBps(bp,cl18);

console.log(JSON.stringify({
  status:"VENUS_BINANCE_READONLY_VALIDATION",
  chainId:97,
  wbnb:WBNB,
  venusBinanceOracle:VENUS_BINANCE,
  runtimeCode:true,
  binancePrice18:bp.toString(),
  chainlink:{raw:clRaw.toString(),decimals:Number(clDec),updatedAt:clRound[3].toString(),normalized18:cl18.toString()},
  deviationBps:dev.toString(),
  within500Bps:dev<=500n,
  independentReferenceCandidateReady:dev<=500n
},null,2));