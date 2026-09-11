import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context={};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/wallet-session-guard.js'),'utf8'),context);
const create=context.LQCWalletSessionGuard.create;

describe('LQC wallet connection session guard',function(){
  it('accepts only the latest attempt for one wallet',function(){const guard=create(),wallet={};const first=guard.begin(wallet),second=guard.begin(wallet);assert.equal(guard.isCurrent(wallet,first),false);assert.equal(guard.isCurrent(wallet,second),true)});
  it('rejects a late response from a replaced wallet',function(){const guard=create(),oldWallet={},newWallet={},oldAttempt=guard.begin(oldWallet),newAttempt=guard.begin(newWallet);assert.equal(guard.isCurrent(oldWallet,oldAttempt),false);assert.equal(guard.isCurrent(newWallet,newAttempt),true)});
  it('invalidates every outstanding response on disconnect or chain reset',function(){const guard=create(),wallet={},attempt=guard.begin(wallet);guard.invalidate();assert.equal(guard.isCurrent(wallet,attempt),false);assert.throws(()=>guard.assertCurrent(wallet,attempt),/WalletConnectionSuperseded/)});
  it('rejects missing targets and forged attempt versions',function(){const guard=create(),wallet={},attempt=guard.begin(wallet);assert.throws(()=>guard.begin(null),/required/);assert.equal(guard.isCurrent(null,attempt),false);assert.equal(guard.isCurrent(wallet,attempt+1),false)});
});
