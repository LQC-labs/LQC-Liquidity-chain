import assert from 'node:assert/strict';
import {collectMvpReadiness,renderMvpReadiness} from '../scripts/check-mvp-readiness.mjs';
import {PANCAKE_BSC_TESTNET} from '../scripts/validate-bsc-testnet.mjs';

const commit='ab'.repeat(20),addr=byte=>`0x${byte.repeat(40)}`;
const valid={BSC_TESTNET_RPC_URL:'https://bsc-testnet.example',EXPECTED_CHAIN_ID:'97',SOURCE_COMMIT:commit,DEPLOYER_PRIVATE_KEY:`0x${'12'.repeat(32)}`,WBNB_ADDRESS:addr('1'),FACTORY_OWNER:addr('2'),RISK_ADMIN:addr('3'),GUARDIAN_ADDRESS:addr('4'),TREASURY_ADDRESS:addr('5'),PANCAKE_V2_ROUTER_ADDRESS:PANCAKE_BSC_TESTNET.v2Router,PANCAKE_V3_ROUTER_ADDRESS:PANCAKE_BSC_TESTNET.v3Router,PANCAKE_V3_QUOTER_ADDRESS:PANCAKE_BSC_TESTNET.v3Quoter,PANCAKE_V3_ALLOWED_POOLS:JSON.stringify([{tokenA:addr('1'),tokenB:addr('6'),fee:2500}]),TEST_VAULT_STRATEGY_CAP:'0'};

describe('LQC BSC testnet MVP readiness gate',function(){
  it('reports every reviewed deployment input ready together',function(){const report=collectMvpReadiness(valid,{currentCommit:commit,dirty:false});assert.equal(report.ready,true);assert.equal(report.blockers.length,0);assert.equal(report.passed,report.total)});
  it('returns all missing blockers in one run',function(){const report=collectMvpReadiness({},{}),ids=report.blockers.map(item=>item.id);for(const id of ['RPC_HTTPS','REVIEWED_CLEAN_COMMIT','RUNTIME_DEPLOYER_KEY','FACTORY_OWNER','RISK_ADMIN','GUARDIAN_ADDRESS','TREASURY_ADDRESS','PANCAKE_V2_PIN','PANCAKE_V3_PINS','PANCAKE_V3_POOLS'])assert.ok(ids.includes(id));assert.ok(report.blockers.length>10)});
  it('blocks shared operational roles and enabled first-deployment strategy',function(){const env={...valid,RISK_ADMIN:valid.FACTORY_OWNER,TEST_VAULT_STRATEGY_CAP:'1'},report=collectMvpReadiness(env,{currentCommit:commit,dirty:false});assert.deepEqual(report.blockers.map(item=>item.id),['ROLE_SEPARATION','VAULT_STRATEGY_DISABLED'])});
  it('never renders secret or address values',function(){const text=renderMvpReadiness(collectMvpReadiness(valid,{currentCommit:'cd'.repeat(20),dirty:true}));assert.doesNotMatch(text,new RegExp(valid.DEPLOYER_PRIVATE_KEY));assert.doesNotMatch(text,new RegExp(valid.FACTORY_OWNER));assert.match(text,/REVIEWED_CLEAN_COMMIT/)});
});
