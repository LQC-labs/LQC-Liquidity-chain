import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context={};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/recovery-sync.js'),'utf8'),context);
const action=context.LQCRecoverySync.storageAction,hash=`0x${'12'.repeat(32)}`,cancel=`0x${'34'.repeat(32)}`;
const input=overrides=>({expectedStorage:true,keyMatches:true,record:{state:'valid',value:{transactionHash:hash}},unverifiedTransactionHash:'',pendingRecoveryActive:false,...overrides});

describe('LQC cross-tab recovery synchronization',function(){
  it('ignores unrelated storage events',function(){assert.equal(action(input({expectedStorage:false})),'ignore');assert.equal(action(input({keyMatches:false})),'ignore')});
  it('releases a passive tab only when current storage has no recovery',function(){assert.equal(action(input({record:{state:'none'}})),'release')});
  it('retains recovery controls while this tab verifies its own transaction',function(){assert.equal(action(input({record:{state:'none'},unverifiedTransactionHash:hash})),'retain');assert.equal(action(input({record:{state:'none'},pendingRecoveryActive:true})),'retain')});
  it('uses current storage state instead of a delayed event value',function(){assert.equal(action(input({newValue:null,record:{state:'valid',value:{transactionHash:cancel}}})),'recover');assert.equal(action(input({newValue:'stale-record',record:{state:'none'}})),'release')});
  it('fails closed on an invalid cross-tab record',function(){assert.equal(action(input({record:{state:'invalid'}})),'invalid')});
  it('starts recovery for a new trade or cancellation update only',function(){assert.equal(action(input({unverifiedTransactionHash:hash})),'ignore');assert.equal(action(input({unverifiedTransactionHash:hash,record:{state:'valid',value:{transactionHash:hash,cancellationHash:cancel}}})),'recover');assert.equal(action(input({record:{state:'valid',value:{transactionHash:cancel}}})),'recover')});
});
