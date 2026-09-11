import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context={};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/trade-gate.js'),'utf8'),context);
const gate=context.LQCTradeGate,ready={requestedDisabled:false,deployed:true,account:'0x1234',swapInFlight:false};

describe('LQC wallet-aware trade gate',function(){
  it('enables execution only for a connected ready deployment',function(){assert.equal(gate.executable(ready),true);assert.equal(gate.disabled(ready),false)});
  it('stays disabled after wallet disconnect even when a stale quote enables itself',function(){assert.equal(gate.disabled({...ready,account:null}),true)});
  it('stays disabled when recovery completion arrives without a wallet',function(){assert.equal(gate.disabled({...ready,account:null,swapInFlight:false}),true)});
  it('blocks undeployed, explicitly disabled, and in-flight states',function(){assert.equal(gate.executable({...ready,deployed:false}),false);assert.equal(gate.executable({...ready,requestedDisabled:true}),false);assert.equal(gate.executable({...ready,swapInFlight:true}),false)});
});
