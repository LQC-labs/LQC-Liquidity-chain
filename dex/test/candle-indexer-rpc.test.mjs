import assert from 'node:assert/strict';
import { selectCanonicalProvider } from '../scripts/candle-indexer-rpc.mjs';

const blockHash=value=>`0x${value.repeat(64)}`;
const source=(name,{head=100,hash=blockHash('a'),chainId=97,fail=false}={})=>({name,getNetwork:async()=>{if(fail)throw new Error('offline');return{chainId:BigInt(chainId)}},getBlockNumber:async()=>head,getBlock:async number=>({number,hash})});

describe('LQC candle indexer redundant RPC consensus',function(){
  it('keeps single-source development compatibility',async function(){
    const primary=source('primary'),selected=await selectCanonicalProvider([primary],12);
    assert.equal(selected.provider,primary);assert.equal(selected.finalizedBlock,88);assert.equal(selected.independentVerified,false);
  });

  it('fails over from an unavailable primary with a three-source quorum',async function(){
    const primary=source('primary',{fail:true}),secondary=source('secondary'),tertiary=source('tertiary');
    const selected=await selectCanonicalProvider([primary,secondary,tertiary],12);
    assert.equal(selected.provider,secondary);assert.equal(selected.healthySources,2);assert.equal(selected.independentVerified,true);
  });

  it('selects the canonical majority when one source diverges',async function(){
    const divergent=source('divergent',{hash:blockHash('f')}),second=source('second'),third=source('third');
    const selected=await selectCanonicalProvider([divergent,second,third],12);
    assert.equal(selected.provider,second);assert.equal(selected.blockHash,blockHash('a'));
  });

  it('fails closed without quorum or matching finalized hashes',async function(){
    await assert.rejects(()=>selectCanonicalProvider([source('a'),source('b',{fail:true})],12),/quorum unavailable/);
    await assert.rejects(()=>selectCanonicalProvider([source('a'),source('b',{hash:blockHash('b')})],12),/disagree/);
    await assert.rejects(()=>selectCanonicalProvider([source('wrong',{chainId:56})],12),/quorum unavailable/);
  });
});
