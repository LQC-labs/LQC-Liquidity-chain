'use strict';
const assert=require('assert');
const {evaluate}=require('../scripts/master3-best-execution-proof-binding');
const base={stage:'3/7',selectedRouteId:'a',chainId:'97',routerAddress:'0xABC',registryVersion:'1',quoteExpiry:'200',
now:'100',canonicalSelectionInput:[
 {routeId:'a',adapterId:'v3',domain:'DEX_FLOW',grossOut:'1000',explicitCost:'10',netOut:'990',riskScore:'2'},
 {routeId:'b',adapterId:'v3',domain:'DEX_FLOW',grossOut:'900',explicitCost:'5',netOut:'895',riskScore:'1'}]};
const a=evaluate(base), b=evaluate({...base,routerAddress:'0xabc'});
assert.strictEqual(a.pass,true); assert.strictEqual(a.activationAuthorized,false);
assert.strictEqual(a.proofDigest,b.proofDigest);
assert.strictEqual(evaluate({...base,now:'200'}).pass,false);
assert.strictEqual(evaluate({...base,selectedRouteId:'z'}).pass,false);
assert.strictEqual(evaluate({...base,futuresStateUsed:true}).pass,false);
assert.strictEqual(evaluate({...base,canonicalSelectionInput:[base.canonicalSelectionInput[0],base.canonicalSelectionInput[0]]}).pass,false);
console.log('Master 3/8 Best Execution proof binding: PASS');
