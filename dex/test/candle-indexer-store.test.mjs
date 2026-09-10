import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { indexerSnapshot, loadIndexerState, saveIndexerState } from '../scripts/candle-indexer-store.mjs';

describe('LQC candle indexer durable checkpoint',function(){
  const pool={address:'0x0000000000000000000000000000000000000001',token0:'0x0000000000000000000000000000000000000002',token1:'0x0000000000000000000000000000000000000003',decimals0:18,decimals1:6,trades:[{base:'0x0000000000000000000000000000000000000002',quote:'0x0000000000000000000000000000000000000003',blockNumber:120,transactionHash:`0x${'11'.repeat(32)}`,logIndex:4,timestamp:100,price:2,baseVolume:3,quoteVolume:6}]};
  let directory,file;
  beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'lqc-indexer-'));file=path.join(directory,'checkpoint.json')});
  afterEach(()=>fs.rmSync(directory,{recursive:true,force:true}));

  it('atomically restores the finalized cursor and trades after restart',function(){
    saveIndexerState(file,indexerSnapshot(97,12345,[pool],{floorBlock:100,anchors:[{number:12000,hash:`0x${'22'.repeat(32)}`}]}));
    const restored=loadIndexerState(file,{chainId:97,pools:[pool]});
    assert.equal(restored.cursor,12345);assert.equal(restored.floorBlock,100);assert.equal(restored.anchors[0].number,12000);assert.equal(restored.trades.get(pool.address).length,1);assert.equal(restored.trades.get(pool.address)[0].price,2);
    assert.deepEqual(fs.readdirSync(directory),['checkpoint.json']);
  });

  it('refuses a checkpoint from another deployment or chain',function(){
    saveIndexerState(file,indexerSnapshot(97,25,[pool]));
    assert.throws(()=>loadIndexerState(file,{chainId:56,pools:[pool]}),/header/);
    assert.throws(()=>loadIndexerState(file,{chainId:97,pools:[{...pool,address:'0x0000000000000000000000000000000000000004'}]}),/identity/);
  });

  it('fails closed on corrupted JSON, malformed trades, and excessive history',function(){
    fs.writeFileSync(file,'{broken');assert.throws(()=>loadIndexerState(file,{chainId:97,pools:[pool]}),/valid JSON/);
    const malformed=indexerSnapshot(97,25,[{...pool,trades:[{...pool.trades[0],price:0}]}]);saveIndexerState(file,malformed);assert.throws(()=>loadIndexerState(file,{chainId:97,pools:[pool]}),/malformed trade/);
    saveIndexerState(file,indexerSnapshot(97,25,[pool]));assert.throws(()=>loadIndexerState(file,{chainId:97,pools:[pool],maxTrades:0}),/trade count/);
  });
});
