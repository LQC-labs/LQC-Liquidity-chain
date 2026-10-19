
import assert from 'node:assert/strict';
import { getAddress, ParamType } from 'ethers';
import { record, dense, uint, hash32, canonical } from './input-schema.mjs';
export { record, dense, uint, hash32, canonical };
export const eq=(a,b,message)=>assert.equal(canonical(a),canonical(b),message);
export function exact(x,keys){record(x,keys);}
export function list(x,max=4096){dense(x,max);return x;}
export function uintAbi(x,bits=256,signed=false){
 if(typeof x==='number'){assert(Number.isSafeInteger(x)&&!Object.is(x,-0),'UNSAFE_ABI_INTEGER');x=String(x);}
 assert(typeof x==='string'&&(signed?/^(0|-?[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(x),'INVALID_ABI_INTEGER');
 const n=BigInt(x),b=BigInt(bits);assert(signed?n>=-(1n<<(b-1n))&&n<(1n<<(b-1n)):n>=0n&&n<(1n<<b),'ABI_INTEGER_RANGE');return n.toString();
}
export function normalizeAbi(type,x){
 const p=typeof type==='string'?ParamType.from(type):type;
 if(p.baseType==='array'){list(x);if(p.arrayLength>=0)assert.equal(x.length,p.arrayLength,'ABI_ARRAY_LENGTH');return x.map(v=>normalizeAbi(p.arrayChildren,v));}
 if(p.baseType==='tuple')throw Error('UNSUPPORTED_ABI_TUPLE');
 if(/^int[0-9]+$/.test(p.type))throw Error('UNSUPPORTED_ABI_SIGNED');
 if(/^uint[0-9]+$/.test(p.type))return uintAbi(x,Number(p.type.replace(/\D/g,'')),p.type.startsWith('int'));
 if(p.type==='address'){assert.equal(typeof x,'string');return getAddress(x);}
 if(p.type==='bool'){assert.equal(typeof x,'boolean','ABI_BOOL_TYPE');return x;}
 if(/^bytes([0-9]+)?$/.test(p.type)){assert(typeof x==='string'&&/^0x(?:[a-fA-F0-9]{2})*$/.test(x),'ABI_BYTES_TYPE');if(p.type!=='bytes')assert.equal(x.length,2+2*Number(p.type.slice(5)),'ABI_BYTES_LENGTH');return x.toLowerCase();}
 assert.equal(p.type,'string','UNSUPPORTED_ABI_TYPE');assert.equal(typeof x,'string');return x;
}
export function argsFor(iface,method,args){const f=iface.getFunction(method);assert(f,'ABI_FUNCTION_REQUIRED');assert.equal(iface.fragments.filter(x=>x.type==='function'&&x.name===f.name).length,1,'UNSUPPORTED_ABI_OVERLOAD');assert(f&&['view','pure'].includes(f.stateMutability),'PUBLIC_VIEW_REQUIRED');list(args);assert.equal(args.length,f.inputs.length,'ABI_ARGUMENT_COUNT');return f.inputs.map((t,i)=>normalizeAbi(t,args[i]));}
export function validateVersion(m,s){
 exact(m,['manifestSchema','runId','reviewStatus','scope','files','artifactContentHashes','sourceFileHashes','policyApproved','priceApproved','autoTrustRegistration','queryJournal','publicAllowlist','requiredQueryPlan','requiredQuerySummary']);
 assert.equal(m.manifestSchema,'LQC_REVIEW_CANDIDATE_MANIFEST_V1','MANIFEST_VERSION');
 assert.equal(m.reviewStatus,'CANDIDATE_NOT_TRUSTED_OR_ACTIVATED');
 exact(m.scope,['chainId','evidenceSchema','schemaVersion','queryBlock','contracts']);
 exact(m.scope.queryBlock,['number','hash','blockTag','timestamp']);
 exact(s,['journalSummary','registryOnlyValidation','schema','schemaVersion','runId','reviewCandidateOnly','status','pastRunReproduction','chainId','chain','genesis','clientVersion','queryBlock','queryHeaderBefore','queryHeaderAfter','queryHashUnchanged','historicalCodeProbe','toolsAndSettings','contracts','fixedBlockCalls','scenarioFinalReads','finalViews','history','receipts','scenarioEvidence','policyEvidence','priceApprovalEvidence','prices','fundsAuthority','settlementAuthorized']);
 assert.equal(s.schema,'LQC_LOCAL_CHAIN_SCOPE_EVIDENCE','EVIDENCE_SCHEMA');assert.equal(s.schemaVersion,'3','EVIDENCE_VERSION');assert.equal(s.status,'COLLECTED');
 for(const key of ['policyApproved','priceApproved','autoTrustRegistration'])assert.equal(m[key],false,'UNAPPROVED_AUTHORITY');
 assert.equal(s.policyEvidence,null);assert.equal(s.priceApprovalEvidence,null);assert.equal(s.fundsAuthority,false);assert.equal(s.settlementAuthorized,false);assert.equal(s.prices,'LOCAL_MOCK_NOT_APPROVED');
 assert.equal(s.reviewCandidateOnly,true);assert.equal(s.pastRunReproduction,false);
 exact(s.queryBlock,['number','hash','blockTag','timestamp']);uint(s.queryBlock.number);uint(s.queryBlock.timestamp);hash32(s.queryBlock.hash);
 exact(m.files,['scopeEvidence','contractCode','runMetadata']);for(const item of [...Object.values(m.files),m.queryJournal,m.publicAllowlist,m.requiredQueryPlan]){exact(item,['path','sha256']);assert.equal(typeof item.path,'string');assert(/^[0-9a-f]{64}$/.test(item.sha256),'INVALID_FILE_SHA256');}
 canonical(m.scope);canonical(s.queryBlock);
}
