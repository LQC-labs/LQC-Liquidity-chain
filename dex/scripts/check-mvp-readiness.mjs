import {pathToFileURL} from 'node:url';
import {ethers} from 'ethers';
import {PANCAKE_BSC_TESTNET} from './validate-bsc-testnet.mjs';
import {validReviewedV3Pools} from './public-testnet-preflight.mjs';
import {readGitSourceState} from './preflight-testnet-deploy.mjs';

const address=value=>ethers.isAddress(value||'');
const add=(items,id,ok,action)=>items.push(Object.freeze({id,status:ok?'PASS':'BLOCKED',action:ok?null:action}));

export function collectMvpReadiness(env,{currentCommit='',dirty=true}={}){
  const items=[];
  let rpcOk=false;try{const url=new URL(env.BSC_TESTNET_RPC_URL||'');rpcOk=url.protocol==='https:'}catch{}
  add(items,'RPC_HTTPS',rpcOk,'Set BSC_TESTNET_RPC_URL to a reviewed HTTPS BSC testnet RPC.');
  add(items,'CHAIN_97',String(env.EXPECTED_CHAIN_ID||'97')==='97','Set EXPECTED_CHAIN_ID=97.');
  const source=env.SOURCE_COMMIT||'',sourceOk=/^[0-9a-fA-F]{40}$/.test(source)&&source.toLowerCase()===currentCommit.toLowerCase()&&!dirty;
  add(items,'REVIEWED_CLEAN_COMMIT',sourceOk,'Commit and review all changes, then set SOURCE_COMMIT to the exact clean HEAD SHA.');
  add(items,'RUNTIME_DEPLOYER_KEY',/^0x[0-9a-fA-F]{64}$/.test(env.DEPLOYER_PRIVATE_KEY||''),'Supply DEPLOYER_PRIVATE_KEY only in the runtime environment.');
  for(const name of ['WBNB_ADDRESS','FACTORY_OWNER','RISK_ADMIN','GUARDIAN_ADDRESS','TREASURY_ADDRESS'])add(items,name,address(env[name]),`Set ${name} to a reviewed BSC testnet address.`);
  const roles=['FACTORY_OWNER','RISK_ADMIN','GUARDIAN_ADDRESS','TREASURY_ADDRESS'].map(name=>env[name]).filter(address).map(value=>ethers.getAddress(value));
  add(items,'ROLE_SEPARATION',roles.length===4&&new Set(roles).size===4,'Use four distinct reviewed governance, risk, guardian, and treasury addresses.');
  const v2=env.PANCAKE_V2_ROUTER_ADDRESS||'';
  add(items,'PANCAKE_V2_PIN',address(v2)&&ethers.getAddress(v2)===PANCAKE_BSC_TESTNET.v2Router,'Use the pinned PancakeSwap V2 BSC testnet router.');
  const v3Router=env.PANCAKE_V3_ROUTER_ADDRESS||'',v3Quoter=env.PANCAKE_V3_QUOTER_ADDRESS||'';
  add(items,'PANCAKE_V3_PINS',address(v3Router)&&address(v3Quoter)&&ethers.getAddress(v3Router)===PANCAKE_BSC_TESTNET.v3Router&&ethers.getAddress(v3Quoter)===PANCAKE_BSC_TESTNET.v3Quoter,'Use both pinned PancakeSwap V3 BSC testnet endpoints.');
  let pools=[];try{pools=JSON.parse(env.PANCAKE_V3_ALLOWED_POOLS||'[]')}catch{}
  add(items,'PANCAKE_V3_POOLS',validReviewedV3Pools(pools),'Add unique reviewed V3 token-pair descriptors using canonical fee tiers to PANCAKE_V3_ALLOWED_POOLS.');
  add(items,'VAULT_STRATEGY_DISABLED',String(env.TEST_VAULT_STRATEGY_CAP||'0')==='0','Keep TEST_VAULT_STRATEGY_CAP=0 for the first MVP deployment.');
  const blockers=items.filter(item=>item.status==='BLOCKED');
  return Object.freeze({ready:blockers.length===0,passed:items.length-blockers.length,total:items.length,items,blockers});
}

export function renderMvpReadiness(report){return [`LQC BSC testnet MVP readiness: ${report.ready?'READY':'BLOCKED'} (${report.passed}/${report.total})`,...report.items.map(item=>`[${item.status}] ${item.id}${item.action?` — ${item.action}`:''}`)].join('\n')}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let gitState={commit:'',dirty:true};try{gitState=readGitSourceState()}catch{}
  const report=collectMvpReadiness(process.env,{currentCommit:gitState.commit,dirty:gitState.dirty});
  process.stdout.write(`${renderMvpReadiness(report)}\n`);process.exitCode=report.ready?0:1;
}
