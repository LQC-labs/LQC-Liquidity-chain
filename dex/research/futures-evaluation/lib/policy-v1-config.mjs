
import {assert,record,dense,hash32,uint,address,fraction,hash,strictWire,NO_AUTHORITY,ECONOMIC_POLICY_VERSION} from './policy-v1-common.mjs';
const price={asset:true,primaryFeed:true,referenceFeed:true,pythId:true,maxAge:true,maxSkew:true,maxDeviationBps:true,maxConfidenceBps:true,normalization:true};
const specification={schema:true,version:true,policyId:true,scope:{chainId:true,domain:true,series:true,core:true,funding:true,partial:true,token:true,decimals:true},origin:true,end:true,epochs:true,D:true,rBps:{n:true,d:true},prices:{market:price,collateral:price},proof:{finalityDepth:true,historySchema:true,inventoryRule:true,boundaryRule:true,stateRule:true,independenceRule:true}};
function missing(value,spec,path,blockers){
 if(value===null||value===undefined){blockers.push('CONFIG_MISSING:'+path);return;}
 record(value,[],Object.keys(spec));
 for(const [k,child]of Object.entries(spec)){
  const at=path?path+'.'+k:k;
  if(!Object.hasOwn(value,k)||value[k]===null)blockers.push('CONFIG_MISSING:'+at);
  else if(child!==true)missing(value[k],child,at,blockers);
 }
}
export function validatePolicyV1Config(config){
 if(config===null)return {state:'UNCONFIGURED',policyCommitment:null,blockers:['CONFIG_MISSING:policy'],activationAllowed:false,...NO_AUTHORITY};
 strictWire(config);const blockers=[];missing(config,specification,'',blockers);
 if(blockers.length)return {state:'UNCONFIGURED',policyCommitment:null,blockers,activationAllowed:false,...NO_AUTHORITY};
 assert.equal(config.schema,ECONOMIC_POLICY_VERSION,'POLICY_SCHEMA');assert.equal(config.version,'1','POLICY_VERSION');
 hash32(config.policyId);
 for(const k of ['chainId','domain','series'])uint(config.scope[k]);
 for(const k of ['core','funding','partial','token'])address(config.scope[k]);
 assert(uint(config.scope.decimals)<=255n,'DECIMALS_RANGE');
 const O=uint(config.origin),E=uint(config.end);assert(E>O,'POLICY_TIME_RANGE');assert(uint(config.D)>0n,'PERIOD_MUST_BE_POSITIVE');fraction(config.rBps);
 dense(config.epochs,64);assert(config.epochs.length>0,'EPOCHS_REQUIRED');let last=O,index=1n;
 for(const e of config.epochs){record(e,['id','from','to']);assert.equal(uint(e.id),index,'EPOCH_SEQUENCE');assert.equal(uint(e.from),last,'EPOCH_COVERAGE');last=uint(e.to);assert(last>uint(e.from),'EPOCH_TIME_RANGE');index++;}assert.equal(last,E,'EPOCH_END');
 for(const p of Object.values(config.prices)){
  assert(typeof p.asset==='string'&&p.asset.length>0&&p.asset.length<=128,'ASSET_ID');
  address(p.primaryFeed);address(p.referenceFeed);assert(p.primaryFeed.toLowerCase()!==p.referenceFeed.toLowerCase(),'INDEPENDENT_FEEDS_REQUIRED');hash32(p.pythId);
  uint(p.maxAge);uint(p.maxSkew);assert(uint(p.maxDeviationBps)<=10000n&&uint(p.maxConfidenceBps)<=10000n,'PRICE_BPS_RANGE');
  assert.equal(p.normalization,'EXACT_18_ONLY','PRICE_NORMALIZATION');
 }
 assert(uint(config.proof.finalityDepth)>0n,'FINALITY_DEPTH_REQUIRED');
 for(const [k,v]of Object.entries({historySchema:'LQC_POLICY_V1_RECORDED_TRANSITIONS_1',inventoryRule:'ALL_POSITIONS_AND_ACCOUNTS',boundaryRule:'LAST_BLOCK_LE_TIMESTAMP_WITH_SUCCESSOR',stateRule:'EXACT_BLOCK_STATE_AND_TRANSACTION_OBSERVATIONS',independenceRule:'FULL_SHARED_OBLIGATION_RECONCILIATION'}))assert.equal(config.proof[k],v,'PROOF_REQUIREMENT:'+k);
 return {state:'CONFIGURED_NOT_APPROVED',policyCommitment:hash(config),blockers:['OPERATIONAL_CONFIGURATION_APPROVAL_NOT_PROVEN'],activationAllowed:false,...NO_AUTHORITY};
}
