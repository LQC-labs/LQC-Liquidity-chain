import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ethers} from 'ethers';
import anvil from './anvil-compat.mjs';
import {positionAggregateKey} from '../../lib/settlement-link-diagnosis.mjs';
import {artifact} from './runtime-tools.mjs';
import {createBridgeFixture} from './bridge-fixture.mjs';
import {observeFixedQ,diagnoseFixedQ,packetForTests,checkFixedQPacketForTests} from './fixed-q-bridge.mjs';
const out=process.env.LQC116_RESULT_DIR;
let rpc,provider,context,packet,identityReobservation;
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
  // Same fixture deployment and position: mine one empty local block and observe again.
  await rpc.request({method:'evm_setNextBlockTimestamp',params:[ethers.toQuantity(BigInt(result.packet.qBefore.timestamp)+1n)]});await rpc.request({method:'evm_mine',params:[]});
  identityReobservation=await observeFixedQ(fixture,provider,rpc,row=>fs.appendFileSync(path.join(out,'identity-reobservation-journal.jsonl'),JSON.stringify(row)+'\n'));
  fs.writeFileSync(path.join(out,'identity-reobservation.json'),JSON.stringify(identityReobservation.packet,null,2));fs.writeFileSync(path.join(out,'identity-reobservation-diagnosis.json'),JSON.stringify(identityReobservation.diagnosis,null,2));
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


 const storedPriceCases=[
  ['zero stored market price reaches stored price guard',4,()=>0n,'STORED_PRICE_TIME'],
  ['zero stored collateral price reaches stored price guard',5,()=>0n,'STORED_PRICE_TIME'],
  ['market observation after exit reaches stored time guard',6,a=>a[1]+1n,'STORED_PRICE_TIME'],
  ['collateral observation after exit reaches stored time guard',7,a=>a[1]+1n,'STORED_PRICE_TIME'],
  ['positive stored market price mutation reaches unchanged commitment',4,a=>a[4]+1n,'SOLIDITY_COMMITMENT']
 ];
 for(const[name,index,value,target]of storedPriceCases)it(name,()=>{
  const clean=packetForTests(context),before=diagnoseFixedQ(context),p=structuredClone(clean),row=p.journal.find(x=>x.name==='exit2'),oldResponse=row.response;
  change(p,'exit2',[X],a=>{a[0][index]=value(a[0]);});
  const oldWords=oldResponse.slice(2).match(/.{64}/g),newWords=row.response.slice(2).match(/.{64}/g);
  assert.deepEqual(oldWords.flatMap((w,i)=>w===newWords[i]?[]:[i]),[index],'SINGLE_ABI_FIELD_MUTATION');
  const restored=structuredClone(p);restored.journal.find(x=>x.name==='exit2').response=oldResponse;assert.deepEqual(restored,clean,'ONLY_ONE_RESPONSE_FIELD_CHANGED');
  assert.deepEqual(p.journal.find(x=>x.name==='inspect'),clean.journal.find(x=>x.name==='inspect'),'ORIGINAL_COMMITMENT_UNCHANGED');
  let error;try{checkFixedQPacketForTests(context,p);}catch(e){error=e;}assert(error,'expected rejection');assert.equal(error.message.split('\n')[0],target,'EXACT_REJECTION_TARGET');
  assert.deepEqual(packetForTests(context),clean,'PRIVATE_PACKET_UNCHANGED');const after=diagnoseFixedQ(context);assert.deepEqual(after,before,'PRIVATE_DIAGNOSIS_REPRODUCIBLE');
  for(const x of[after,after.researchPlan]){assert.equal(x.evaluationStatus,'NOT_EVALUATED');for(const k of ['confirmedAmount','returnAmount'])assert.equal(x[k],null,k);for(const[k,v]of Object.entries(x))if(k.endsWith('Authority')||k.endsWith('Authorized')||['createsClaim','consumesHistory','rightsTransitionComplete'].includes(k))assert.equal(v,false,k);}
  assert.equal(after.researchPlan.payableAmount,null);assert.equal(after.researchPlan.positionTotals.nettingAuthorized,false);
  direct.push({name,target,actual:error.message,directTargetReached:true,query:'exit2',changedABIField:index,oldWord:oldWords[index],newWord:newWords[index],onlyOneFieldChanged:true,commitmentUnchanged:true,privateObservationReproducible:true,boundary:'LOCAL_PRICE_BYTES_BINDING_NOT_ORACLE_OR_MALICIOUS_NODE_AUTHENTICATION'});
 });


 it('private position identity mapping is reproducible and never authorizes consumption',()=>{
  const a=diagnoseFixedQ(context),b=diagnoseFixedQ(context),x=a.researchPlan.identityCorrespondence;assert.deepEqual(a,b);
  assert.equal(x.nativePositionKey,a.scope.key);assert.equal(x.positionAggregateKey,positionAggregateKey(x.scope,'PNL'));assert.notEqual(x.nativePositionKey,x.positionAggregateKey);assert.equal(x.nativeAndAggregateByteEqualityClaimed,false);
  assert.equal(x.evaluationId,a.researchPlan.evaluationId);assert.equal(x.sourceSemanticCommitment,a.jsSemanticCommitment);assert.deepEqual(x.scope.queryBlock,a.scope.query);
  assert.deepEqual(x.scope.contracts.map(c=>c.role),['Core','Funding','Partial','Attribution']);assert.equal(a.scope.contracts.length,5);assert.equal(x.scope.contracts.length,4);
  assert.equal(x.consumptionLink,'UNVERIFIED');assert.equal(x.rightsLink,'UNVERIFIED');assert.equal(x.authoritativeConsumed,null);assert.equal(x.authoritativeRemaining,null);assert.equal(x.ledgerMigrationImplemented,false);
  x.scope.contracts[0].address=ethers.ZeroAddress;assert.deepEqual(diagnoseFixedQ(context),b,'RETURNED_MAPPING_CANNOT_MUTATE_PRIVATE_CONTEXT');
  assert.throws(()=>diagnoseFixedQ({runId:context.runId,identityCorrespondence:b.researchPlan.identityCorrespondence}),/PRIVATE_LOCAL_OBSERVATION_REQUIRED/);
 });
 it('actual same-deployment later Q and run preserve position identity not evaluation identity',()=>{
  const a=diagnoseFixedQ(context),b=diagnoseFixedQ(identityReobservation.context),x=a.researchPlan.identityCorrespondence,y=b.researchPlan.identityCorrespondence;
  assert(BigInt(b.scope.query.number)>BigInt(a.scope.query.number));assert.notEqual(b.scope.query.hash,a.scope.query.hash);assert.notEqual(identityReobservation.packet.runId,packetForTests(context).runId);
  assert.deepEqual(a.scope.contracts,b.scope.contracts);assert.deepEqual(x.scope.contracts,y.scope.contracts);assert.equal(x.nativePositionKey,y.nativePositionKey);assert.equal(x.positionAggregateKey,y.positionAggregateKey);
  assert.notEqual(x.sourceSemanticCommitment,y.sourceSemanticCommitment);assert.notEqual(x.evaluationId,y.evaluationId);assert.equal(a.solidityCommitment,b.solidityCommitment);assert.deepEqual(a.researchPlan.positionTotals,b.researchPlan.positionTotals);
  const first=packetForTests(context);for(const n of ['context','basis','trace','transition1','transition2','transition3','exit2','exit3','inspect'])assert.equal(first.journal.find(x=>x.name===n).response,identityReobservation.packet.journal.find(x=>x.name===n).response,n);
  for(const d of[a,b]){assert.equal(d.evaluationStatus,'NOT_EVALUATED');for(const k of ['confirmedAmount','returnAmount'])assert.equal(d[k],null);assert.equal(d.researchPlan.payableAmount,null);assert.equal(d.researchPlan.positionTotals.nettingAuthorized,false);for(const obj of[d,d.researchPlan])for(const[k,v]of Object.entries(obj))if(k.endsWith('Authority')||k.endsWith('Authorized')||['createsClaim','consumesHistory','rightsTransitionComplete'].includes(k))assert.equal(v,false,k);}
 });
 it('synthetic scope variations distinguish position identities without creating private contexts',()=>{
  const x=diagnoseFixedQ(context).researchPlan.identityCorrespondence,changes={chainId:'97',domain:'3',series:'2',account:'0x0000000000000000000000000000000000000001',pid:'2'};
  for(const[k,v]of Object.entries(changes)){const scope=structuredClone(x.scope);scope[k]=v;assert.notEqual(positionAggregateKey(scope,'PNL'),x.positionAggregateKey,k);}
  for(const field of ['address','runtimeHash','role']){const scope=structuredClone(x.scope);scope.contracts[0][field]=field==='address'?'0x0000000000000000000000000000000000000001':field==='runtimeHash'?ethers.ZeroHash:'OtherCore';assert.notEqual(positionAggregateKey(scope,'PNL'),x.positionAggregateKey,field);}
  const withVerifier=structuredClone(x.scope);withVerifier.contracts.push(diagnoseFixedQ(context).scope.contracts[4]);assert.notEqual(positionAggregateKey(withVerifier,'PNL'),x.positionAggregateKey,'ROLE_SET_IS_IDENTITY_INPUT');
  const reordered=structuredClone(x.scope);reordered.contracts.reverse();assert.equal(positionAggregateKey(reordered,'PNL'),x.positionAggregateKey,'EXISTING_ROLE_SORTING');
 });
 it('research PnL uses each exit price and exact fraction totals',()=>{const p=diagnoseFixedQ(context).researchPlan;assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.rawToken),[{n:'1000000',d:'9'},{n:'500000',d:'1'}]);assert.deepEqual(p.positionTotals.rawTokenGain,{n:'5500000',d:'9'});assert.deepEqual(p.positionTotals.usd18Gain,{n:'500000000000000000',d:'1'});assert.notDeepEqual(p.positionTotals.rawTokenGain,{n:'625000',d:'1'});assert.equal(p.positionTotals.nettingAuthorized,false);});
 it('research PnL leaves Funding limits consumption and money rights unconfirmed',()=>{const a=diagnoseFixedQ(context).researchPlan,b=diagnoseFixedQ(context).researchPlan;assert.equal(a.evaluationId,b.evaluationId);for(const k of ['funding','fees','confirmedAmount','payableAmount','returnAmount','lpRecoveryAmount'])assert.equal(a[k],null,k);assert.equal(a.fundingEvidence.evidenceCompleteness,'MISSING');for(const k of ['authoritativeLimit','priorConsumed','remaining','rights','reservations'])assert.equal(a.account[k],null,k);assert.equal(a.evaluationStatus,'NOT_EVALUATED');for(const[k,v]of Object.entries(a))if(k.endsWith('Authorized')||k.endsWith('Authority')||['createsClaim','consumesHistory','rightsTransitionComplete'].includes(k))assert.equal(v,false,k);});
 const domainType=new ethers.Interface(artifact('LocalFuturesCore').abi).getFunction('domain').outputs[0].format('sighash');
 for(const [name,index,value,target]of [['research domain token mismatch',0,ethers.ZeroAddress,'DOMAIN_TOKEN'],['research domain decimals mismatch',6,18n,'DOMAIN_DECIMALS'],['research domain Oracle address mismatch',1,ethers.ZeroAddress,'DOMAIN_MARKET_ORACLE']])it(name,()=>{const p=packetForTests(context);change(p,'domain',[domainType],a=>{a[0][index]=value;});assert.throws(()=>checkFixedQPacketForTests(context,p),new RegExp(target));direct.push({name,target,directTargetReached:true});});
 it('original packet remains reproducible after mutation cases',()=>{const clean=packetForTests(context),before=diagnoseFixedQ(context);packet.qBefore.hash=ethers.id('mutated returned observation');packet.journal[0].request.params[0]=ethers.ZeroAddress;before.scope.query.hash=ethers.id('mutated returned diagnosis');assert.throws(()=>checkFixedQPacketForTests(context,packet),/Q_SCOPE/);assert.deepEqual(checkFixedQPacketForTests(context,clean),diagnoseFixedQ(context));assert.notEqual(diagnoseFixedQ(context).scope.query.hash,before.scope.query.hash);});
});

// A separate actual local deployment, not a fabricated SHORT transport packet.
describe('fixed Q SHORT local bridge',function(){
 this.timeout(180000);let rpc,provider,context;
 const direct=[];
 before(async()=>{
  rpc=anvil.provider({wallet:{totalAccounts:4}});await rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:20});
  const fixture=await createBridgeFixture(provider,await provider.getSigner(0),await provider.getSigner(1),'SHORT');
  const result=await observeFixedQ(fixture,provider,rpc,row=>fs.appendFileSync(path.join(out,'short-observation-journal.jsonl'),JSON.stringify(row)+'\n'));
  context=result.context;fs.writeFileSync(path.join(out,'short-observation.json'),JSON.stringify(result.packet,null,2));fs.writeFileSync(path.join(out,'short-diagnosis.json'),JSON.stringify(result.diagnosis,null,2));
 });
 after(async()=>{fs.writeFileSync(path.join(out,'short-direct-rejection-points.json'),JSON.stringify(direct,null,2));provider?.destroy();await rpc?.disconnect();});
 it('actual SHORT partial and final closes preserve both OI chains',()=>{
  const p=packetForTests(context),a=ethers.AbiCoder.defaultAbiCoder(),W=10n**18n;
  assert.equal(a.decode([T],p.journal.find(r=>r.name==='trace').response)[0][8],false);
  assert.deepEqual([1,2,3].map(i=>Array.from(a.decode([R],p.journal.find(r=>r.name==='transition'+i).response)[0]).slice(3,7)),[[0n,0n,0n,3n*W],[0n,3n*W,0n,2n*W],[0n,2n*W,0n,0n]]);
  const d=diagnoseFixedQ(context);assert.equal(d.researchPlan.side,'SHORT');assert.equal(d.completelyClosed,true);assert.equal(d.existingHistoryDiagnosis.integrals.official.short,(50n*W).toString());assert.equal(d.existingHistoryDiagnosis.integrals.official.long,'0');
 });
 it('signed SHORT PnL and separate gain loss match hand fractions',()=>{
  const p=diagnoseFixedQ(context).researchPlan;
  assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.rawToken),[{n:'-1000000',d:'9'},{n:'-500000',d:'1'}]);
  assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.usd18),[{n:'-100000000000000000',d:'1'},{n:'-400000000000000000',d:'1'}]);
  assert.deepEqual(p.positionTotals.rawTokenNet,{n:'-5500000',d:'9'});assert.deepEqual(p.positionTotals.rawTokenLoss,{n:'5500000',d:'9'});assert.deepEqual(p.positionTotals.rawTokenGain,{n:'0',d:'1'});
  assert.deepEqual(p.positionTotals.usd18Net,{n:'-500000000000000000',d:'1'});assert.deepEqual(p.positionTotals.usd18Loss,{n:'500000000000000000',d:'1'});assert.deepEqual(p.positionTotals.usd18Gain,{n:'0',d:'1'});assert.equal(p.positionTotals.nettingAuthorized,false);
 });
 const cases=[
  ['stored direction mutation reaches direction binding','STORED_DIRECTION_MISMATCH',p=>change(p,'trace',[T],a=>{a[0][8]=true;})],
  ['missing stored direction is rejected without LONG default','STORED_DIRECTION_REQUIRED',p=>{const r=p.journal.find(r=>r.name==='trace');r.response=r.response.slice(0,-64);}],
  ['unknown ABI direction is rejected without bool coercion','STORED_DIRECTION_INVALID',p=>{const r=p.journal.find(r=>r.name==='trace');r.response=r.response.slice(0,-64)+'2'.padStart(64,'0');}],
  ['SHORT quantity mutation reaches quantity chain','OLD_QUANTITY',p=>change(p,'transition2',[R],a=>{a[0][4]+=1n;})],
  ['opposite old OI reaches side check before Receipt digest','OPPOSITE_OLD_OI',p=>change(p,'transition2',[R],a=>{a[0][3]=1n;})],
  ['opposite next OI reaches side check before Receipt digest','OPPOSITE_NEXT_OI',p=>change(p,'transition2',[R],a=>{a[0][5]=1n;})]
 ];
 for(const[name,target,mutate]of cases)it(name,()=>{const p=packetForTests(context);mutate(p);let error;try{checkFixedQPacketForTests(context,p);}catch(e){error=e;}assert(error,'expected rejection');assert(error.message.includes(target),error.message);direct.push({name,target,actual:error.message,directTargetReached:true,boundary:'MUTATED_TRANSPORT_PRIVATE_LOCAL_RUN_NOT_CHAIN_AUTHENTICATION'});});
 it('SHORT research keeps all amounts unconfirmed and authorities false',()=>{
  const d=diagnoseFixedQ(context),p=d.researchPlan;for(const x of[d,p]){assert.equal(x.evaluationStatus,'NOT_EVALUATED');for(const k of ['confirmedAmount','returnAmount','lpRecoveryAmount'])assert.equal(x[k],null,k);for(const[k,v]of Object.entries(x))if(k.endsWith('Authorized')||k.endsWith('Authority')||['createsClaim','consumesHistory','rightsTransitionComplete','rightsTransferAuthorized'].includes(k))assert.equal(v,false,k);}
  for(const k of ['funding','fees','payableAmount'])assert.equal(p[k],null,k);assert.equal(p.account.rights,null);assert.equal(p.account.remaining,null);assert.equal(p.fundingEvidence.evidenceCompleteness,'MISSING');
 });
});

// Actual new local history; existing rising LONG and SHORT cases above are unchanged.
describe('fixed Q falling-price SHORT local bridge',function(){
 this.timeout(180000);let rpc,provider,context;
 before(async()=>{
  rpc=anvil.provider({wallet:{totalAccounts:4}});await rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:20});
  const fixture=await createBridgeFixture(provider,await provider.getSigner(0),await provider.getSigner(1),'SHORT','FALLING');
  const result=await observeFixedQ(fixture,provider,rpc,row=>fs.appendFileSync(path.join(out,'short-profit-journal.jsonl'),JSON.stringify(row)+'\n'));
  context=result.context;fs.writeFileSync(path.join(out,'short-profit-observation.json'),JSON.stringify(result.packet,null,2));fs.writeFileSync(path.join(out,'short-profit-diagnosis.json'),JSON.stringify(result.diagnosis,null,2));
 });
 after(async()=>{provider?.destroy();await rpc?.disconnect();});
 it('actual falling-price history binds direction OI prices Receipts Sequence time and Q',()=>{
  const p=packetForTests(context),abi=ethers.AbiCoder.defaultAbiCoder(),W=10n**18n,raw=n=>p.journal.find(x=>x.name===n).response;
  const rows=[1,2,3].map(i=>abi.decode([R],raw('transition'+i))[0]),exits=[2,3].map(i=>abi.decode([X],raw('exit'+i))[0]);
  assert.equal(abi.decode([T],raw('trace'))[0][8],false);
  assert.deepEqual(rows.map(t=>Array.from(t).slice(3,7)),[[0n,0n,0n,3n*W],[0n,3n*W,0n,2n*W],[0n,2n*W,0n,0n]]);
  assert.deepEqual(rows.map(t=>t[2]),[1n,2n,3n]);assert.deepEqual(rows.map(t=>t[0]-rows[0][0]),[0n,10n,20n]);
  assert.deepEqual(exits.map(e=>e[4]),[9n*W/10n,8n*W/10n]);assert.deepEqual(exits.map(e=>e[5]),[9n*W/10n,8n*W/10n]);
  assert.deepEqual(exits.map(e=>e[10]),rows.slice(1).map(t=>t[7]));assert.deepEqual(exits.map(e=>e[3]),[W,3n*W]);
  assert.deepEqual(p.qBefore,p.qAfter);const d=diagnoseFixedQ(context);assert(d.historyMatches&&d.completelyClosed);assert.equal(d.researchPlan.side,'SHORT');assert.notEqual(d.solidityCommitment,d.jsSemanticCommitment);
  assert.equal(d.existingHistoryDiagnosis.integrals.official.short,(50n*W).toString());assert.equal(d.existingHistoryDiagnosis.integrals.official.long,'0');
 });
 it('SHORT positive signed legs gains and zero losses match independent fractions',()=>{
  const p=diagnoseFixedQ(context).researchPlan;
  // q*(entry-market)/entry: 1*(1-.9)=.1, 2*(1-.8)=.4 USD.
  // Raw at 6 decimals: (.1/.9)*10^6=1000000/9; (.4/.8)*10^6=500000.
  assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.rawToken),[{n:'1000000',d:'9'},{n:'500000',d:'1'}]);
  assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.usd18),[{n:'100000000000000000',d:'1'},{n:'400000000000000000',d:'1'}]);
  for(const k of ['rawTokenNet','rawTokenGain'])assert.deepEqual(p.positionTotals[k],{n:'5500000',d:'9'},k);
  for(const k of ['usd18Net','usd18Gain'])assert.deepEqual(p.positionTotals[k],{n:'500000000000000000',d:'1'},k);
  for(const k of ['rawTokenLoss','usd18Loss'])assert.deepEqual(p.positionTotals[k],{n:'0',d:'1'},k);assert.equal(p.positionTotals.nettingAuthorized,false);
 });
 it('SHORT gains do not authorize settlement return or missing evidence',()=>{
  const d=diagnoseFixedQ(context),p=d.researchPlan;for(const x of[d,p]){assert.equal(x.evaluationStatus,'NOT_EVALUATED');for(const k of ['confirmedAmount','returnAmount','lpRecoveryAmount'])assert.equal(x[k],null,k);for(const[k,v]of Object.entries(x))if(k.endsWith('Authorized')||k.endsWith('Authority')||['createsClaim','consumesHistory','rightsTransitionComplete'].includes(k))assert.equal(v,false,k);}
  for(const k of ['funding','fees','payableAmount'])assert.equal(p[k],null,k);for(const k of ['authoritativeLimit','priorConsumed','remaining','rights','reservations'])assert.equal(p.account[k],null,k);assert.equal(p.fundingEvidence.evidenceCompleteness,'MISSING');assert(p.blockers.includes('EXISTING_SERIES_NOT_APPROVED_POLICY_V1'));
 });
});

// One real local SHORT history with a profitable partial and loss-making final exit.
describe('fixed Q mixed-PnL SHORT local bridge',function(){
 this.timeout(180000);let rpc,provider,context;
 before(async()=>{
  rpc=anvil.provider({wallet:{totalAccounts:4}});await rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:20});
  const fixture=await createBridgeFixture(provider,await provider.getSigner(0),await provider.getSigner(1),'SHORT','MIXED');
  const result=await observeFixedQ(fixture,provider,rpc,row=>fs.appendFileSync(path.join(out,'short-mixed-journal.jsonl'),JSON.stringify(row)+'\n'));
  context=result.context;fs.writeFileSync(path.join(out,'short-mixed-observation.json'),JSON.stringify(result.packet,null,2));fs.writeFileSync(path.join(out,'short-mixed-diagnosis.json'),JSON.stringify(result.diagnosis,null,2));
 });
 after(async()=>{provider?.destroy();await rpc?.disconnect();});
 it('actual mixed-price SHORT history binds stored fields Receipts and Q',()=>{
  const p=packetForTests(context),abi=ethers.AbiCoder.defaultAbiCoder(),W=10n**18n,raw=n=>p.journal.find(x=>x.name===n).response;
  const rows=[1,2,3].map(i=>abi.decode([R],raw('transition'+i))[0]),exits=[2,3].map(i=>abi.decode([X],raw('exit'+i))[0]);
  assert.equal(abi.decode([T],raw('trace'))[0][8],false);
  assert.deepEqual(rows.map(t=>Array.from(t).slice(3,7)),[[0n,0n,0n,3n*W],[0n,3n*W,0n,2n*W],[0n,2n*W,0n,0n]]);
  assert.deepEqual(rows.map(t=>t[2]),[1n,2n,3n]);assert.deepEqual(rows.map(t=>t[0]-rows[0][0]),[0n,10n,20n]);
  assert.deepEqual(exits.map(e=>e[4]),[9n*W/10n,12n*W/10n]);assert.deepEqual(exits.map(e=>e[5]),[9n*W/10n,8n*W/10n]);
  assert.deepEqual(exits.map(e=>e[1]),rows.slice(1).map(t=>t[0]));assert.deepEqual(exits.map(e=>e[10]),rows.slice(1).map(t=>t[7]));assert.deepEqual(exits.map(e=>e[3]),[W,3n*W]);
  assert.deepEqual(p.qBefore,p.qAfter);const d=diagnoseFixedQ(context);assert(d.historyMatches&&d.completelyClosed);assert.equal(d.researchPlan.side,'SHORT');assert.notEqual(d.solidityCommitment,d.jsSemanticCommitment);
  assert.equal(d.existingHistoryDiagnosis.integrals.official.short,(50n*W).toString());assert.equal(d.existingHistoryDiagnosis.integrals.official.long,'0');
 });
 it('signed mixed PnL preserves gains and losses as independent fractions',()=>{
  const p=diagnoseFixedQ(context).researchPlan;
  // USD nominal SHORT: 1*(1-.9)=+1/10; 2*(1-1.2)=-2/5.
  // Raw: (+1/10)/(9/10)*10^6=1000000/9; (-2/5)/(4/5)*10^6=-500000.
  assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.rawToken),[{n:'1000000',d:'9'},{n:'-500000',d:'1'}]);
  assert.deepEqual(p.legs.map(l=>l.pnlDiagnostic.usd18),[{n:'100000000000000000',d:'1'},{n:'-400000000000000000',d:'1'}]);
  assert.deepEqual(p.positionTotals.rawTokenNet,{n:'-3500000',d:'9'});assert.deepEqual(p.positionTotals.rawTokenGain,{n:'1000000',d:'9'});assert.deepEqual(p.positionTotals.rawTokenLoss,{n:'500000',d:'1'});
  assert.deepEqual(p.positionTotals.usd18Net,{n:'-300000000000000000',d:'1'});assert.deepEqual(p.positionTotals.usd18Gain,{n:'100000000000000000',d:'1'});assert.deepEqual(p.positionTotals.usd18Loss,{n:'400000000000000000',d:'1'});assert.equal(p.positionTotals.nettingAuthorized,false);
 });
 it('mixed PnL remains unevaluated with null money and false authorities',()=>{
  const d=diagnoseFixedQ(context),p=d.researchPlan;for(const x of[d,p]){assert.equal(x.evaluationStatus,'NOT_EVALUATED');for(const k of ['confirmedAmount','returnAmount','lpRecoveryAmount'])assert.equal(x[k],null,k);for(const[k,v]of Object.entries(x))if(k.endsWith('Authorized')||k.endsWith('Authority')||['createsClaim','consumesHistory','rightsTransitionComplete'].includes(k))assert.equal(v,false,k);}
  for(const k of ['funding','fees','payableAmount'])assert.equal(p[k],null,k);for(const k of ['authoritativeLimit','priorConsumed','remaining','rights','reservations'])assert.equal(p.account[k],null,k);assert.equal(p.fundingEvidence.evidenceCompleteness,'MISSING');assert(p.blockers.includes('EXISTING_SERIES_NOT_APPROVED_POLICY_V1'));
 });
});
