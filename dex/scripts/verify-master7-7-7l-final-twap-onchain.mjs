import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { twapTickToScaledPrice } from "./futures-twap-price-conversion.mjs";

const TX_HASH="0x6d34b3851d48967c5a77303e1635344dc2385186cb73755bade0c72a98d11ebe";
const EXPECTED_FROM="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const EXPECTED_ADDRESS="0x5ae96e36356ac18728804577e926b4b362017c0d";
const EXPECTED_POOL="0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17";
const EXPECTED_INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const EXPECTED_QUOTE="0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const EXPECTED_WINDOW=1800n;
const EXPECTED_MIN_LIQ=1n;

const ABI=[
 "function pool() view returns(address)",
 "function indexToken() view returns(address)",
 "function quoteToken() view returns(address)",
 "function observationWindow() view returns(uint32)",
 "function minimumLiquidity() view returns(uint128)",
 "function indexTokenDecimals() view returns(uint8)",
 "function quoteTokenDecimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
];

function artifact(){
 const root=path.resolve(import.meta.dirname,"..");
 return JSON.parse(fs.readFileSync(path.join(root,"artifacts","contracts","futures","LQCV3TwapReferenceAdapter.sol","LQCV3TwapReferenceAdapter.json"),"utf8"));
}

export async function verifyFinalTwap(provider){
 const network=await provider.getNetwork();
 if(network.chainId!==97n) throw new Error("Expected BSC Testnet chain 97.");

 const [tx,receipt]=await Promise.all([
   provider.getTransaction(TX_HASH),
   provider.getTransactionReceipt(TX_HASH)
 ]);
 if(!tx||!receipt) throw new Error("Transaction or receipt not found.");
 if(receipt.status!==1) throw new Error("Final TWAP deployment transaction failed.");
 if(tx.to!==null||receipt.to!==null) throw new Error("Expected contract creation.");
 if(ethers.getAddress(receipt.from)!==ethers.getAddress(EXPECTED_FROM)) throw new Error("Unexpected deployer.");
 if(!receipt.contractAddress) throw new Error("Missing contract address.");
 const address=ethers.getAddress(receipt.contractAddress);
 if(address!==ethers.getAddress(EXPECTED_ADDRESS)) throw new Error("Deployed address mismatch.");

 const a=artifact();
 if(!String(tx.data).toLowerCase().startsWith(String(a.bytecode).toLowerCase())){
   throw new Error("Final deployment initcode does not match current artifact.");
 }
 if(await provider.getCode(address)==="0x") throw new Error("No runtime bytecode.");

 const c=new ethers.Contract(address,ABI,provider);
 const [pool,indexToken,quoteToken,window,minLiquidity,idxDec,qDec]=await Promise.all([
   c.pool(),c.indexToken(),c.quoteToken(),c.observationWindow(),c.minimumLiquidity(),c.indexTokenDecimals(),c.quoteTokenDecimals()
 ]);
 if(ethers.getAddress(pool)!==ethers.getAddress(EXPECTED_POOL)) throw new Error("Pool mismatch.");
 if(ethers.getAddress(indexToken)!==ethers.getAddress(EXPECTED_INDEX)) throw new Error("Index mismatch.");
 if(ethers.getAddress(quoteToken)!==ethers.getAddress(EXPECTED_QUOTE)) throw new Error("Quote mismatch.");
 if(BigInt(window)!==EXPECTED_WINDOW) throw new Error("Window mismatch.");
 if(BigInt(minLiquidity)!==EXPECTED_MIN_LIQ) throw new Error("Min liquidity mismatch.");

 const poolAbi=[
   "function token0() view returns(address)",
   "function token1() view returns(address)",
   "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint32,bool)",
   "function liquidity() view returns(uint128)",
   "function observe(uint32[] secondsAgos) view returns(int56[],uint160[])"
 ];
 const p=new ethers.Contract(EXPECTED_POOL,poolAbi,provider);
 const [token0,token1,slot,liquidity,obs]=await Promise.all([
   p.token0(),p.token1(),p.slot0(),p.liquidity(),p.observe([Number(EXPECTED_WINDOW),0])
 ]);
 if(Number(slot[3])<2) throw new Error("Pool observation cardinality below 2.");
 if(!slot[6]) throw new Error("Pool locked.");
 if(BigInt(liquidity)<EXPECTED_MIN_LIQ) throw new Error("Pool liquidity too low.");

 const ticks=obs[0];
 const delta=ticks[1]-ticks[0];
 let mean=delta/EXPECTED_WINDOW;
 if(delta<0n && delta%EXPECTED_WINDOW!==0n) mean-=1n;

 const expected=twapTickToScaledPrice({
   tick:Number(mean),token0,token1,indexToken:EXPECTED_INDEX,quoteToken:EXPECTED_QUOTE,
   token0Decimals:Number(idxDec),token1Decimals:Number(qDec)
 });
 const latest=await c.latestRoundData({gasLimit:15_000_000n});
 const answer=BigInt(latest[1]);
 if(answer!==expected) throw new Error(`On-chain TWAP answer mismatch: ${answer} != ${expected}`);
 if(answer<=0n) throw new Error("TWAP answer must be positive.");

 return {
   status:"FINAL_TWAP_ONCHAIN_VERIFIED",
   chainId:97,
   transactionHash:TX_HASH,
   blockNumber:receipt.blockNumber,
   deployer:receipt.from,
   contractAddress:address,
   initcodeMatchesCurrentArtifact:true,
   constructorState:{
     pool:ethers.getAddress(pool),
     indexToken:ethers.getAddress(indexToken),
     quoteToken:ethers.getAddress(quoteToken),
     observationWindow:Number(window),
     minimumLiquidity:minLiquidity.toString(),
     indexTokenDecimals:Number(idxDec),
     quoteTokenDecimals:Number(qDec)
   },
   livePoolState:{
     token0:ethers.getAddress(token0),
     token1:ethers.getAddress(token1),
     tick:Number(slot[1]),
     observationCardinality:Number(slot[3]),
     observationCardinalityNext:Number(slot[4]),
     feeProtocol:Number(slot[5]),
     unlocked:slot[6],
     liquidity:liquidity.toString(),
     arithmeticMeanTick:Number(mean)
   },
   latestRoundData:{
     roundId:latest[0].toString(),
     answer:answer.toString(),
     startedAt:latest[2].toString(),
     updatedAt:latest[3].toString(),
     answeredInRound:latest[4].toString()
   },
   expectedScaledPrice:expected.toString(),
   governanceAuthorized:false
 };
}

if(import.meta.url===new URL("file://"+process.argv[1]).href){
 const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
 verifyFinalTwap(provider)
   .then(r=>console.log(JSON.stringify(r,null,2)))
   .catch(e=>{console.error("FINAL FAIL:",e.message);process.exitCode=1;});
}
