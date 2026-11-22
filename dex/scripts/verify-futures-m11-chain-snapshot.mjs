// 76-17-⑥-⑤ / M11 — read-only candidate chain snapshot gate.
// No signer, transaction submission, deployment, secret access or asset movement.
// Candidate absent: BLOCKED with NO RPC. Candidate exists: inspect only pinned block.
import { readFileSync,writeFileSync } from "node:fs";
import {pathToFileURL} from "node:url";
import {ethers} from "ethers";

const CORE=["registry","vault","engine","oracle"];
const FIELDS=[...CORE,"collateralToken"];
const LEGACY=new Set([
 "0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
 "0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
 "0xe4f1320c8709631776c7e39e0916584935882525",
 "0xbf6a446c5e17228e70e45645ab47f751bdfc4b41"]);
const HEX64=/^0x[0-9a-f]{64}$/i;
const abi=new ethers.Interface([
 "function engine() view returns(address)",
 "function registry() view returns(address)",
 "function vault() view returns(address)",
 "function owner() view returns(address)",
 "function guardian() view returns(address)",
 "function marketCount() view returns(uint256)",
 "function markets(uint256) view returns(bytes32,address,address,address,uint32,uint32,bool)"
]);
const normalize=v=>typeof v==="string"&&ethers.isAddress(v)&&v!==ethers.ZeroAddress?v.toLowerCase():null;
const unassigned=v=>v===undefined||v===null||v==="UNASSIGNED";
const add=(r,s)=>r.blockers.push(s);
function invalid(r,msg){r.failures.push(msg);return r}
async function readContract(provider,to,name,args,block){
 const raw=await provider.call({to,data:abi.encodeFunctionData(name,args)},block);
 return abi.decodeFunctionResult(name,raw);
}
export async function verifyM11Candidate(manifest,provider=null) {
 const r={schema:"lqc-m11-chain-snapshot-v1",status:"BLOCKED",chainId:97,
   snapshotBlock:null,snapshotHash:null,
   checks:[],blockers:[],failures:[],rpcQueried:false,
   candidateAddressesVerified:false,oracleProvenanceVerified:false,
   deploymentAuthorized:false,assetTransferAuthorized:false,
   historicalSetEngineAuthorized:false,marketActivationAuthorized:false};
 try{
   if(!manifest||manifest.schema!=="lqc-m10-isolation-manifest-v1"||manifest.chainId!==97||
      manifest.candidate?.chainId!==97)throw Error("wrong manifest or chain");
   const c=manifest.candidate,values={};
   if(c.reusesHistoricalVault!==false||c.callsHistoricalSetEngine!==false||
      c.automaticallyTransfersLegacyAssets!==false||c.copiesLegacyPositions!==false)
      throw Error("unsafe migration flag");
   for(const key of FIELDS){
     if(unassigned(c[key])){add(r,"candidate "+key+" UNASSIGNED");continue;}
     const addr=normalize(c[key]);
     if(!addr)throw Error("invalid candidate "+key);
     if(LEGACY.has(addr))throw Error("candidate aliases historic core "+key);
     if(Object.values(values).includes(addr))throw Error("duplicate candidate "+key);
     values[key]=addr;
   }
   if(FIELDS.some(k=>!values[k]))return r;
   if(!provider){add(r,"no read-only RPC client supplied");return r;}
   // No network calls until validated candidate is complete and distinct.
   r.rpcQueried=true;
   const net=await provider.getNetwork();
   if(Number(net.chainId)!==97)throw Error("RPC chainId mismatch");
   const tag=manifest.m11?.blockNumber;
   if(!Number.isSafeInteger(tag)||tag<0){add(r,"canonical candidate block number missing");return r;}
   const blk=await provider.getBlock(tag);
   if(!blk?.hash||!HEX64.test(blk.hash))throw Error("block unavailable/invalid");
   r.snapshotBlock=tag;r.snapshotHash=blk.hash;
   if(!manifest.m11?.blockHash||manifest.m11.blockHash.toLowerCase()!==blk.hash.toLowerCase())
     throw Error("candidate block hash differs from independent manifest anchor");
   for(const key of CORE){
     const code=await provider.getCode(values[key],tag);
     if(typeof code!=="string"||code==="0x")throw Error(key+" no contract code at anchored block");
     const hash=ethers.keccak256(code);
     const expected=manifest.source?.[key+"RuntimeCodehash"];
     if(!HEX64.test(expected||"")){add(r,key+" runtime hash not independently pinned");continue;}
     if(hash.toLowerCase()!==expected.toLowerCase())throw Error(key+" runtime hash mismatch");
     r.checks.push({name:key+"RuntimeCodehash",status:"MATCH",codehash:hash});
   }
   const actual={
     vaultEngine:normalize((await readContract(provider,values.vault,"engine",[],tag))[0]),
     engineRegistry:normalize((await readContract(provider,values.engine,"registry",[],tag))[0]),
     engineVault:normalize((await readContract(provider,values.engine,"vault",[],tag))[0])
   };
   const expected={vaultEngine:values.engine,engineRegistry:values.registry,engineVault:values.vault};
   for(const key of Object.keys(expected)){
     if(actual[key]!==expected[key])throw Error(key+" wrong on-chain wiring");
     if(manifest.wiring?.[key]?.toLowerCase()!==expected[key])throw Error(key+" mismatched manifest wiring");
     r.checks.push({name:key,status:"MATCH"});
   }
   for(const key of ["registry","vault","oracle"]){
     const owner=normalize((await readContract(provider,values[key],"owner",[],tag))[0]);
     if(!owner)throw Error(key+" owner unset");
     const expectedOwner=normalize(manifest.m11?.owners?.[key]);
     if(!expectedOwner){add(r,key+" owner expected authority missing");continue;}
     if(owner!==expectedOwner)throw Error(key+" owner mismatch");
     r.checks.push({name:key+"Owner",status:"MATCH",owner});
   }
   const guardian=normalize((await readContract(provider,values.registry,"guardian",[],tag))[0]);
   const expectedGuardian=normalize(manifest.m11?.guardian);
   if(!expectedGuardian){add(r,"Registry guardian independently pinned value missing");}
   else if(guardian!==expectedGuardian)throw Error("Registry guardian mismatch");
   else r.checks.push({name:"registryGuardian",status:"MATCH",guardian});
   const marketId=manifest.m11?.marketId;
   if(!Number.isSafeInteger(marketId)||marketId<=0){add(r,"market ID missing for Oracle crosscheck");}
   else {
     const count=BigInt((await readContract(provider,values.registry,"marketCount",[],tag))[0]);
     if(BigInt(marketId)>count)throw Error("market missing from candidate Registry");
     const market=await readContract(provider,values.registry,"markets",[marketId],tag);
     const oracle=normalize(market[3]),collateral=normalize(market[2]);
     if(oracle!==values.oracle)throw Error("market Oracle points outside candidate");
     if(collateral!==values.collateralToken)throw Error("market collateral mismatch");
     if(manifest.wiring?.marketOracle?.toLowerCase()!==values.oracle)throw Error("market Oracle manifest wiring mismatch");
     r.checks.push({name:"marketOracleAndCollateral",status:"MATCH",marketId});
   }
   r.candidateAddressesVerified=r.failures.length===0;
   add(r,"Oracle feed/source and proxy implementation provenance must be independently reviewed; runtime codehash is insufficient");
   add(r,"Owner/guardian match does not establish multisig custody, independent audit, deployment approval or real asset rights");
   add(r,"M11 never authorizes deployment, market activation, historical cutover, or asset movement");
 } catch(e){invalid(r,String(e.shortMessage||e.message||e).slice(0,320))}
 r.status=r.failures.length?"FAIL":"BLOCKED";
 return r;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const input=process.argv[2];
 if(!input||process.argv.length!==3){console.error("Usage: node scripts/verify-futures-m11-chain-snapshot.mjs M10_MANIFEST.json");process.exitCode=2;}
 else try{
   const m=JSON.parse(readFileSync(input,"utf8"));
   // Never use RPC unless candidate addresses and user-supplied anchored block exist.
   const all=FIELDS.every(k=>normalize(m?.candidate?.[k]));
   const rpc=all&&m.m11?.blockNumber!==undefined&&process.env.BSC_TESTNET_READONLY_RPC
     ?new ethers.JsonRpcProvider(process.env.BSC_TESTNET_READONLY_RPC,97,{staticNetwork:true}):null;
   const result=await verifyM11Candidate(m,rpc);
   console.log(JSON.stringify(result,null,2));
   if(process.env.M11_VERDICT_FILE)writeFileSync(process.env.M11_VERDICT_FILE,JSON.stringify(result,null,2)+"\n");
   if(result.status==="FAIL")process.exitCode=1;
 }catch(e){console.error(String(e.message));process.exitCode=2;}
}
