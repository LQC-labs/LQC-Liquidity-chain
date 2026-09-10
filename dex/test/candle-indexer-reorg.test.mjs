import assert from 'node:assert/strict';
import { appendFinalizedAnchor, detectReorg, rollbackTrades, validateAnchors } from '../scripts/candle-indexer-reorg.mjs';

const hash=value=>`0x${value.repeat(64)}`;

describe('LQC candle indexer chain reorg recovery',function(){
  it('keeps the cursor when the newest finalized anchor is canonical',async function(){
    const anchors=[{number:100,hash:hash('a')},{number:200,hash:hash('b')}];
    const result=await detectReorg(anchors,async number=>({number,hash:hash(number===200?'b':'a')}),50);
    assert.equal(result.reorg,false);assert.equal(result.rewindBlock,null);assert.deepEqual(result.anchors,anchors);
  });

  it('rewinds to the block after the newest matching anchor',async function(){
    const anchors=[{number:100,hash:hash('a')},{number:200,hash:hash('b')},{number:300,hash:hash('c')}];
    const result=await detectReorg(anchors,async number=>({number,hash:number===100?hash('a'):hash('f')}),50);
    assert.deepEqual(result,{reorg:true,rewindBlock:101,anchors:[anchors[0]]});
  });

  it('rewinds to the indexed floor when no saved anchor survives',async function(){
    const result=await detectReorg([{number:100,hash:hash('a')}],async number=>({number,hash:hash('f')}),75);
    assert.deepEqual(result,{reorg:true,rewindBlock:75,anchors:[]});
  });

  it('drops orphaned trades and retains bounded monotonic anchors',function(){
    assert.deepEqual(rollbackTrades([{blockNumber:99},{blockNumber:100},{blockNumber:101}],100),[{blockNumber:99}]);
    const anchors=appendFinalizedAnchor([{number:10,hash:hash('a')},{number:20,hash:hash('b')}],{number:20,hash:hash('c')},2);
    assert.deepEqual(anchors,[{number:10,hash:hash('a')},{number:20,hash:hash('c')}]);
    assert.throws(()=>validateAnchors([{number:20,hash:hash('a')},{number:10,hash:hash('b')}]),/malformed block anchor/);
  });
});
