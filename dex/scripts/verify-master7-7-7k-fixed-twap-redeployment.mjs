import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const TX_HASH="0xf417e52a85e1bb212db6418bbe6178483ef4e55d1e78b2b8b1f1e68f1cfa4e19";
const EXPECTED_FROM="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
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
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
];

function artifact(){
 const root=path.resolve(import.meta.dirname,"..");
 const file=path.join(root,"artifacts","contracts","futures","LQCV3TwapReferenceAdapter.sol","LQCV3TwapReferenceAdapter.json");
 return JSON.parse(fs.readFileSync(file,"utf8"));
}

function errData(e){return e?.data||e?.error?.data||e?.info?.error?.data||null;}

export async function verifyFixedRedeployment(provider){
 const network=await provider.getNetwork();
 if(network.chainId!==97n)throw new Error("Expected BSC Testnet chain 97.");

 const [tx,receipt]=await Promise.all([
   provider.getTransaction(TX_HASH),
   provider.getTransactionReceipt(TX_HASH)
 ]);
 if(!tx||!receipt)throw new Error("Transaction or receipt not found.");
 if(receipt.status!==1)throw new Error("Redeployment transaction failed.");
 if(receipt.to!==null||tx.to!==null)throw new Error("Expected contract-creation transaction.");
 if(ethers.getAddress(receipt.from)!==ethers.getAddress(EXPECTED_FROM))throw new Error("Unexpected deployer.");
 if(!receipt.contractAddress)throw new Error("Missing deployed contract address.");

 const a=artifact();
 if(!String(tx.data).toLowerCase().startsWith(String(a.bytecode).toLowerCase())){
   throw new Error("Transaction initcode does not match current fixed artifact bytecode.");
 }

 const address=ethers.getAddress(receipt.contractAddress);
 if(await provider.getCode(address)==="0x")throw new Error("No runtime bytecode at redeployed adapter.");

 const c=new ethers.Contract(address,ABI,provider);
 const [pool,indexToken,quoteToken,window,minLiquidity]=await Promise.all([
   c.pool(),c.indexToken(),c.quoteToken(),c.observationWindow(),c.minimumLiquidity()
 ]);
 if(ethers.getAddress(pool)!==ethers.getAddress(EXPECTED_POOL))throw new Error("Pool mismatch.");
 if(ethers.getAddress(indexToken)!==ethers.getAddress(EXPECTED_INDEX))throw new Error("Index token mismatch.");
 if(ethers.getAddress(quoteToken)!==ethers.getAddress(EXPECTED_QUOTE))throw new Error("Quote token mismatch.");
 if(BigInt(window)!==EXPECTED_WINDOW)throw new Error("Observation window mismatch.");
 if(BigInt(minLiquidity)!==EXPECTED_MIN_LIQ)throw new Error("Minimum liquidity mismatch.");

 const latest={ok:false};
 try{
   const r=await c.latestRoundData();
   latest.ok=true;
   latest.roundId=r[0].toString();
   latest.answer=r[1].toString();
   latest.startedAt=r[2].toString();
   latest.updatedAt=r[3].toString();
   latest.answeredInRound=r[4].toString();
 }catch(e){
   latest.error=e.shortMessage||e.message||String(e);
   latest.data=errData(e);
 }

 return {
   status:latest.ok?"FIXED_TWAP_REDEPLOYMENT_VERIFIED":"FIXED_TWAP_REDEPLOYMENT_RUNTIME_FAIL",
   chainId:97,
   transactionHash:TX_HASH,
   blockNumber:receipt.blockNumber,
   deployer:receipt.from,
   contractAddress:address,
   initcodeMatchesCurrentFixedArtifact:true,
   constructorState:{
     pool:ethers.getAddress(pool),
     indexToken:ethers.getAddress(indexToken),
     quoteToken:ethers.getAddress(quoteToken),
     observationWindow:Number(window),
     minimumLiquidity:minLiquidity.toString()
   },
   latestRoundData:latest,
   transactionOccurred:false,
   governanceAuthorized:false
 };
}

if(import.meta.url===new URL("file://"+process.argv[1]).href){
 const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
 verifyFixedRedeployment(provider)
  .then(r=>{console.log(JSON.stringify(r,null,2));if(!r.latestRoundData.ok)process.exitCode=3;})
  .catch(e=>{console.error("FINAL FAIL:",e.message);process.exitCode=1;});
}
