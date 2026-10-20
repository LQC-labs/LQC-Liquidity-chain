import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ethers} from 'ethers';
import anvil from './anvil-compat.mjs';
import {artifact} from './runtime-tools.mjs';
import {createBridgeFixture} from './bridge-fixture.mjs';
import {observeFixedQ,diagnoseFixedQ,packetForTests,checkFixedQPacketForTests} from './fixed-q-bridge.mjs';
const out=process.env.LQC116_RESULT_DIR;
let rpc,provider,context,packet;
const direct=[];
function change(p,name,types,fn){const row=p.journal.find(x=>x.name===name);const decoded=Array.from(ethers.AbiCoder.defaultAbiCoder().decode(types,row.response),x=>Array.isArray(x)?Array.from(x):x);fn(decoded);row.response=ethers.AbiCoder.defaultAbiCoder().encode(types,decoded);}
const T='tuple(bytes32,address,uint256,uint256,uint256,uint256,uint256,uint256,bool)',R='tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes32)',X='tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes32)';
describe('fixed Q Solidity JS local bridge',function(){
 this.timeout(180000);
 before(async()=>{
  rpc=anvil.provider({wallet:{totalAccounts:4}});await rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:20});
  const fixture=await createBridgeFixture(provider,await provider.getSigner(0),await provider.getSigner(1));
  const result=await observeFixedQ(fixture,provider,rpc,row=>fs.appendFileSync(path.join(out,'observation-journal.jsonl'),JSON.stringify(row)+'\n'));
  context=result.context;packet=result.packet;fs.writeFileSync(path.join(out,'observation.json'),JSON.stringify(packet,null,2));fs.writeFileSync(path.join(out,'diagnosis.json'),JSON.stringify(result.diagnosis,null,2));
 });
 after(async()=>{fs.writeFileSync(path.join(out,'direct-rejection-points.json'),JSON.stringify(direct,null,2));provider?.destroy();await rpc?.disconnect();});
 it('normal complete local history binds both commitments at one Q',()=>{const r=diagnoseFixedQ(context);assert(r.historyMatches&&r.completelyClosed);assert.notEqual(r.solidityCommitment,r.jsSemanticCommitment);assert.equal(r.existingHistoryDiagnosis.exits.length,2);assert.equal(r.existingHistoryDiagnosis.integrals.official.long,'50000000000000000000');assert.equal(r.coordinatorComparison.status,'UNVERIFIED');assert.equal(r.evaluationStatus,'NOT_EVALUATED');assert.equal(r.confirmedAmount,null);assert.equal(r.returnAmount,null);for(const [k,v]of Object.entries(r))if(k.endsWith('Authorized')||k.endsWith('Authority')||['createsClaim','consumesHistory'].includes(k))assert.equal(v,false,k);});
 it('caller report cannot create private observation context',()=>assert.throws(()=>diagnoseFixedQ({historyMatches:true}),/PRIVATE_LOCAL_OBSERVATION_REQUIRED/));
 it('raw evidence is required beyond a submitted report',()=>{const p=packetForTests(context);p.journal=p.journal.filter(x=>x.name==='inspect');assert.throws(()=>checkFixedQPacketForTests(context,p),/RAW_EVIDENCE_REQUIRED/);});
 const cases=[
  ['runtime bytes mismatch','RUNTIME_0',p=>{p.journal.find(x=>x.name==='code0').response='0x6000';}],
  ['Series mismatch reaches Series comparison','SERIES',p=>change(p,'context',['address','uint256[5]','bytes32'],a=>{a[1][1]=2n;})],
  ['foreign pid reaches raw transition check','PID',p=>change(p,'transition2',[R],a=>{a[0][1]=2n;})],
  ['different Q request is rejected','QUERY_SCOPE',p=>{p.journal.find(x=>x.name==='basis').request.params[1]='0x1';}],
  ['raw Sequence mutation reaches Sequence comparison','SEQUENCE',p=>change(p,'transition2',[R],a=>{a[0][2]=4n;})],
  ['business Receipt mutation reaches Receipt comparison','BUSINESS_RECEIPT',p=>change(p,'transition2',[R],a=>{a[0][7]=ethers.id('wrong business receipt');})],
  ['old quantity mutation reaches quantity chain check','OLD_QUANTITY',p=>change(p,'transition2',[R],a=>{a[0][3]+=1n;})],
  ['stored exit timestamp mutation reaches timestamp comparison','EXIT_TIMESTAMP',p=>change(p,'exit2',[X],a=>{a[0][1]+=1n;})],
  ['Q header change reaches Q identity comparison','Q_HASH_CHANGED',p=>{p.qAfter.hash=ethers.id('changed Q');}],
  ['report commitment mutation reaches reconstructed commitment check','SOLIDITY_COMMITMENT',p=>{const row=p.journal.find(x=>x.name==='inspect');row.response=row.response.slice(0,2+8*64)+ethers.id('bad commitment').slice(2)+row.response.slice(2+9*64);}],
  ['transaction block above Q is not accepted','TRANSACTION_AFTER_Q',p=>{p.transactions[0].receipt.blockNumber=ethers.toQuantity(BigInt(packet.qBefore.number)+1n);}],
  ['event timestamp must match the raw transition','EVENT_TIMESTAMP',p=>{const x=p.transactions.find(t=>t.receipt.logs.some(l=>l.topics[0]===ethers.id('Recorded(uint256,uint256,uint256,uint256,bytes32)')));x.header.timestamp=ethers.toQuantity(BigInt(x.header.timestamp)+1n);}],
 ];
 for(const [name,target,mutate]of cases)it(name,()=>{const p=packetForTests(context);mutate(p);let caught;try{checkFixedQPacketForTests(context,p);}catch(e){caught=e;}assert(caught,'expected rejection');assert(caught.message.includes(target),caught.message);direct.push({name,target,actual:caught.message,directTargetReached:true,boundary:'MUTATED_TRANSPORT_USING_PRIVATE_RUN_REFERENCE_NOT_RPC_AUTHENTICATION'});});

 it('research PnL uses each exit price and exact fraction totals',()=>{const p=diagnoseFixedQ(context).researchPlan;assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.rawToken),[{n:'1000000',d:'9'},{n:'500000',d:'1'}]);assert.deepEqual(p.positionTotals.rawTokenGain,{n:'5500000',d:'9'});assert.deepEqual(p.positionTotals.usd18Gain,{n:'500000000000000000',d:'1'});assert.notDeepEqual(p.positionTotals.rawTokenGain,{n:'625000',d:'1'});assert.equal(p.positionTotals.nettingAuthorized,false);});
 it('research PnL leaves Funding limits consumption and money rights unconfirmed',()=>{const a=diagnoseFixedQ(context).researchPlan,b=diagnoseFixedQ(context).researchPlan;assert.equal(a.evaluationId,b.evaluationId);for(const k of ['funding','fees','confirmedAmount','payableAmount','returnAmount','lpRecoveryAmount'])assert.equal(a[k],null,k);assert.equal(a.fundingEvidence.evidenceCompleteness,'MISSING');for(const k of ['authoritativeLimit','priorConsumed','remaining','rights','reservations'])assert.equal(a.account[k],null,k);assert.equal(a.evaluationStatus,'NOT_EVALUATED');for(const[k,v]of Object.entries(a))if(k.endsWith('Authorized')||k.endsWith('Authority')||['createsClaim','consumesHistory','rightsTransitionComplete'].includes(k))assert.equal(v,false,k);});
 const domainType=new ethers.Interface(artifact('LocalFuturesCore').abi).getFunction('domain').outputs[0].format('sighash');
 for(const [name,index,value,target]of [['research domain token mismatch',0,ethers.ZeroAddress,'DOMAIN_TOKEN'],['research domain decimals mismatch',6,18n,'DOMAIN_DECIMALS'],['research domain Oracle address mismatch',1,ethers.ZeroAddress,'DOMAIN_MARKET_ORACLE']])it(name,()=>{const p=packetForTests(context);change(p,'domain',[domainType],a=>{a[0][index]=value;});assert.throws(()=>checkFixedQPacketForTests(context,p),new RegExp(target));direct.push({name,target,directTargetReached:true});});
 it('original packet remains reproducible after mutation cases',()=>{const clean=packetForTests(context),before=diagnoseFixedQ(context);packet.qBefore.hash=ethers.id('mutated returned observation');packet.journal[0].request.params[0]=ethers.ZeroAddress;before.scope.query.hash=ethers.id('mutated returned diagnosis');assert.throws(()=>checkFixedQPacketForTests(context,packet),/Q_SCOPE/);assert.deepEqual(checkFixedQPacketForTests(context,clean),diagnoseFixedQ(context));assert.notEqual(diagnoseFixedQ(context).scope.query.hash,before.scope.query.hash);});
});
