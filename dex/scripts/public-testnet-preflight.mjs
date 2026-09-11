import {pathToFileURL} from 'node:url';
import {ethers} from 'ethers';
import {PANCAKE_BSC_TESTNET,assertBscTestnetChain,assertContractCode,assertPancakeV3PoolsExist} from './validate-bsc-testnet.mjs';

const CANONICAL_V3_FEES=new Set([100,500,2500,10000]);
const same=(a,b)=>ethers.getAddress(a)===ethers.getAddress(b);
export function validReviewedV3Pools(pools){
  if(!Array.isArray(pools)||pools.length===0)return false;const seen=new Set();
  for(const pool of pools){if(!ethers.isAddress(pool?.tokenA)||!ethers.isAddress(pool?.tokenB)||same(pool.tokenA,pool.tokenB)||!CANONICAL_V3_FEES.has(Number(pool.fee)))return false;const key=[ethers.getAddress(pool.tokenA),ethers.getAddress(pool.tokenB)].sort().join(':')+`:${Number(pool.fee)}`;if(seen.has(key))return false;seen.add(key)}return true;
}
export function validatePublicTestnetConfig(env){
  let rpc;try{rpc=new URL(env.BSC_TESTNET_RPC_URL||'')}catch{throw new Error('BSC_TESTNET_RPC_URL must be a valid reviewed HTTPS URL.')}if(rpc.protocol!=='https:')throw new Error('BSC_TESTNET_RPC_URL must use HTTPS.');
  if(String(env.EXPECTED_CHAIN_ID||'97')!=='97')throw new Error('EXPECTED_CHAIN_ID must be 97.');
  if(!ethers.isAddress(env.WBNB_ADDRESS||''))throw new Error('WBNB_ADDRESS must be a valid BSC testnet address.');
  for(const [name,expected] of [['PANCAKE_V2_ROUTER_ADDRESS',PANCAKE_BSC_TESTNET.v2Router],['PANCAKE_V3_ROUTER_ADDRESS',PANCAKE_BSC_TESTNET.v3Router],['PANCAKE_V3_QUOTER_ADDRESS',PANCAKE_BSC_TESTNET.v3Quoter]])if(!ethers.isAddress(env[name]||'')||!same(env[name],expected))throw new Error(`${name} must match the pinned BSC testnet endpoint.`);
  let pools;try{pools=JSON.parse(env.PANCAKE_V3_ALLOWED_POOLS||'[]')}catch{throw new Error('PANCAKE_V3_ALLOWED_POOLS must be valid JSON.')}if(!validReviewedV3Pools(pools))throw new Error('PANCAKE_V3_ALLOWED_POOLS must contain unique reviewed token pairs using canonical fee tiers.');
  return Object.freeze({rpcUrl:rpc.href,wbnb:ethers.getAddress(env.WBNB_ADDRESS),pools});
}
export async function runPublicTestnetPreflight(env,{provider,codeCheck=assertContractCode,poolCheck=assertPancakeV3PoolsExist}={}){
  const config=validatePublicTestnetConfig(env),source=provider||new ethers.JsonRpcProvider(config.rpcUrl),network=await source.getNetwork();assertBscTestnetChain(network.chainId);
  const contracts={wbnb:config.wbnb,...PANCAKE_BSC_TESTNET};await codeCheck(source,contracts);await poolCheck(source,config.pools);
  return Object.freeze({ok:true,network:'BSC Testnet',chainId:97,checkedContracts:Object.keys(contracts),reviewedV3Pools:config.pools.length});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await runPublicTestnetPreflight(process.env);process.stdout.write(`${JSON.stringify(result,null,2)}\n`)}
