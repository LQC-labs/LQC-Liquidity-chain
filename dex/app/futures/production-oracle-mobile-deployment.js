const CHAIN_ID=97;
const CHAIN_HEX="0x61";
const DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const OWNER="0x89d992f696B40ABbDB6610144faeF336911D8175";
const MIN_RESERVE_WEI=300000000000000000n;
const MAX_CUMULATIVE_SPEND_WEI=100000000000000000n;

const lower=x=>String(x||"").toLowerCase();

export function assertProductionOracleMobileContext({chainId,account}){
  const parsed=typeof chainId==="string"&&chainId.startsWith("0x")?Number.parseInt(chainId,16):Number(chainId);
  if(parsed!==CHAIN_ID)throw new Error("Wrong network: BSC Testnet chain 97 is required.");
  if(lower(account)!==lower(DEPLOYER))throw new Error("Wrong signer: approved Futures deployer is required.");
  if(lower(DEPLOYER)===lower(OWNER))throw new Error("Unsafe role configuration: deployer and Governance owner must differ.");
  return {chainId:CHAIN_ID,deployer:DEPLOYER,owner:OWNER};
}

export function validateProductionOracleMobileConfig(v){
  const address=(x,label)=>{
    if(!globalThis.ethers?.isAddress?.(x))throw new Error(label+" must be a valid address.");
    const a=globalThis.ethers.getAddress(x);
    if(a===globalThis.ethers.ZeroAddress)throw new Error(label+" cannot be zero.");
    return a;
  };
  const indexToken=address(v.indexToken,"Index token");
  const quoteToken=address(v.quoteToken,"Quote token");
  const primaryFeed=address(v.primaryFeed,"Primary feed");
  const twapPool=address(v.twapPool,"TWAP pool");
  if(indexToken===quoteToken)throw new Error("Index and quote token must differ.");
  const heartbeat=Number(v.heartbeat),maxDeviationBps=Number(v.maxDeviationBps),window=Number(v.window);
  const minimumLiquidity=BigInt(String(v.minimumLiquidity||"0"));
  if(!Number.isInteger(heartbeat)||heartbeat<1||heartbeat>86400)throw new Error("Heartbeat must be 1..86400 seconds.");
  if(!Number.isInteger(maxDeviationBps)||maxDeviationBps<1||maxDeviationBps>5000)throw new Error("Deviation must be 1..5000 bps.");
  if(!Number.isInteger(window)||window<300||window>86400)throw new Error("TWAP window must be 300..86400 seconds.");
  if(minimumLiquidity<=0n)throw new Error("Minimum liquidity must be greater than zero.");
  return {indexToken,quoteToken,primaryFeed,twapPool,heartbeat,maxDeviationBps,window,minimumLiquidity};
}

export function assertProductionOracleMobileBudget({startBalanceWei,currentBalanceWei,estimatedCostWei}){
  const start=BigInt(startBalanceWei),current=BigInt(currentBalanceWei),cost=BigInt(estimatedCostWei);
  if(start<=0n||current<=0n||current>start)throw new Error("Invalid deployment balance baseline.");
  if(cost<=0n)throw new Error("Estimated deployment cost must be positive.");
  const spent=start-current,projected=spent+cost,remaining=current-cost;
  if(projected>MAX_CUMULATIVE_SPEND_WEI)throw new Error("Projected Oracle deployment spend exceeds 0.1 tBNB.");
  if(remaining<MIN_RESERVE_WEI)throw new Error("Deployment would violate the 0.3 tBNB protected reserve.");
  return {spentWei:spent,projectedSpendWei:projected,remainingWei:remaining};
}

export async function requestProductionOracleTransaction(provider,tx){
  if(!provider?.request)throw new Error("Wallet provider is required.");
  if(!tx?.data||lower(tx.from)!==lower(DEPLOYER))throw new Error("Prepared transaction or signer mismatch.");
  return provider.request({method:"eth_sendTransaction",params:[tx]});
}

export const PRODUCTION_ORACLE_MOBILE=Object.freeze({
  chainId:CHAIN_ID,chainIdHex:CHAIN_HEX,deployer:DEPLOYER,owner:OWNER,
  minReserveWei:MIN_RESERVE_WEI.toString(),maxCumulativeSpendWei:MAX_CUMULATIVE_SPEND_WEI.toString(),
  privateKeyInputSupported:false
});
