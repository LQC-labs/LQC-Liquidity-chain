import { ethers } from "ethers";

const TX_HASH="0x9e102cb51b49c0193a01cffe67ccdd573fa8a49f9e1594af64bbe490f270da45";
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
  "function indexTokenDecimals() view returns(uint8)",
  "function quoteTokenDecimals() view returns(uint8)"
];

export async function verifyRecoveredTwapDeployment(provider){
  const network=await provider.getNetwork();
  if(network.chainId!==97n) throw new Error("Expected BSC Testnet chain 97.");

  const receipt=await provider.getTransactionReceipt(TX_HASH);
  if(!receipt) throw new Error("Transaction receipt not found.");
  if(receipt.status!==1) throw new Error("TWAP deployment transaction failed.");
  if(receipt.to!==null) throw new Error("Expected contract-creation transaction.");
  if(ethers.getAddress(receipt.from)!==ethers.getAddress(EXPECTED_FROM)) throw new Error("Unexpected deployer.");
  if(!receipt.contractAddress) throw new Error("Missing contractAddress in receipt.");

  const address=ethers.getAddress(receipt.contractAddress);
  const code=await provider.getCode(address);
  if(code==="0x") throw new Error("Recovered TWAP adapter has no runtime bytecode.");

  const c=new ethers.Contract(address,ABI,provider);
  const [pool,indexToken,quoteToken,window,minLiquidity,indexDecimals,quoteDecimals]=await Promise.all([
    c.pool(),c.indexToken(),c.quoteToken(),c.observationWindow(),c.minimumLiquidity(),c.indexTokenDecimals(),c.quoteTokenDecimals()
  ]);

  if(ethers.getAddress(pool)!==ethers.getAddress(EXPECTED_POOL)) throw new Error("Pool mismatch.");
  if(ethers.getAddress(indexToken)!==ethers.getAddress(EXPECTED_INDEX)) throw new Error("Index token mismatch.");
  if(ethers.getAddress(quoteToken)!==ethers.getAddress(EXPECTED_QUOTE)) throw new Error("Quote token mismatch.");
  if(BigInt(window)!==EXPECTED_WINDOW) throw new Error("Observation window mismatch.");
  if(BigInt(minLiquidity)!==EXPECTED_MIN_LIQ) throw new Error("Minimum liquidity mismatch.");

  return {
    status:"RECOVERED_TWAP_DEPLOYMENT_VERIFIED",
    chainId:97,
    transactionHash:TX_HASH,
    blockNumber:receipt.blockNumber,
    deployer:receipt.from,
    contractAddress:address,
    runtimeCodePresent:true,
    constructorState:{
      pool:ethers.getAddress(pool),
      indexToken:ethers.getAddress(indexToken),
      quoteToken:ethers.getAddress(quoteToken),
      observationWindow:Number(window),
      minimumLiquidity:minLiquidity.toString(),
      indexTokenDecimals:Number(indexDecimals),
      quoteTokenDecimals:Number(quoteDecimals)
    },
    transactionOccurred:false,
    governanceAuthorized:false
  };
}

if(import.meta.url===new URL("file://"+process.argv[1]).href){
  const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
  verifyRecoveredTwapDeployment(provider)
    .then(r=>console.log(JSON.stringify(r,null,2)))
    .catch(e=>{console.error("FINAL FAIL:",e.message);process.exitCode=1;});
}
