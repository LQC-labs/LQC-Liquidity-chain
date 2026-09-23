import { ethers } from "ethers";
const PRIMARY="0x2582c3156e42df6115c020fb8006b3949c93c1a9";
const INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const FEED="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const TWAP="0x5AE96E36356AC18728804577E926B4b362017c0d";
const abi=["function owner() view returns(address)","function feedConfigs(address) view returns(address,uint32,address,uint16)"];
const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
const c=new ethers.Contract(PRIMARY,abi,provider);
const [owner,cfg]=await Promise.all([c.owner(),c.feedConfigs(INDEX)]);
console.log(JSON.stringify({
 chainId:Number((await provider.getNetwork()).chainId),
 owner,
 feed:cfg[0],heartbeat:Number(cfg[1]),
 referenceFeed:cfg[2],maxDeviationBps:Number(cfg[3]),
 feedMatches:ethers.getAddress(cfg[0])===ethers.getAddress(FEED)&&Number(cfg[1])===3600,
 circuitBreakerMatches:ethers.getAddress(cfg[2])===ethers.getAddress(TWAP)&&Number(cfg[3])===500
},null,2));