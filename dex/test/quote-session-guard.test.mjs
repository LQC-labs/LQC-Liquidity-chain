import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context={};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/quote-session-guard.js'),'utf8'),context);
const create=context.LQCQuoteSessionGuard.create,quote={tokenIn:'a',tokenOut:'b',amount:'1',slippage:'0.5',wallet:1};

describe('LQC quote session guard',function(){
  it('accepts only the latest unchanged quote context',function(){const guard=create(),ticket=guard.begin(quote);assert.equal(guard.isCurrent(ticket,quote),true)});
  it('rejects a slower prior quote after a newer request starts',function(){const guard=create(),old=guard.begin(quote),latest=guard.begin({...quote,amount:'2'});assert.equal(guard.isCurrent(old,quote),false);assert.equal(guard.isCurrent(latest,{...quote,amount:'2'}),true)});
  it('rejects token, amount, slippage, and wallet context changes',function(){for(const [key,value] of [['tokenIn','c'],['tokenOut','c'],['amount','9'],['slippage','1'],['wallet',2]]){const guard=create(),ticket=guard.begin(quote);assert.equal(guard.isCurrent(ticket,{...quote,[key]:value}),false)}});
  it('invalidates an outstanding quote before a debounced replacement begins',function(){const guard=create(),ticket=guard.begin(quote);guard.invalidate();assert.equal(guard.isCurrent(ticket,quote),false)});
});
