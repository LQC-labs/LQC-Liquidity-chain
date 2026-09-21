'use strict';
const assert=require('assert');
const {evaluate}=require('../scripts/master3-best-execution-determinism');

const a={routeId:'route-b',adapterId:'v3',domain:'DEX_FLOW',approvedAdapter:true,grossOut:'1000',explicitCost:'10',riskScore:'2'};
const b={routeId:'route-a',adapterId:'v3',domain:'DEX_FLOW',approvedAdapter:true,grossOut:'1000',explicitCost:'10',riskScore:'2'};
const c={routeId:'route-c',adapterId:'v3',domain:'DEX_FLOW',approvedAdapter:true,grossOut:'1005',explicitCost:'20',riskScore:'1'};

const r1=evaluate({candidates:[a,b,c]});
const r2=evaluate({candidates:[c,b,a]});
assert.strictEqual(r1.pass,true);
assert.strictEqual(r1.activationAuthorized,false);
assert.strictEqual(r1.selectedRouteId,'route-a');
assert.deepStrictEqual(r1,r2);

assert.strictEqual(evaluate({candidates:[{...a,approvedAdapter:false}]}).pass,false);
assert.strictEqual(evaluate({candidates:[{...a,domain:'FUTURES'}]}).pass,false);
assert.strictEqual(evaluate({candidates:[{...a,stale:true}]}).pass,false);
assert.strictEqual(evaluate({candidates:[a,a]}).pass,false);
assert.strictEqual(evaluate({candidates:[a],futuresStateUsed:true}).pass,false);
assert.strictEqual(evaluate({candidates:[a],lendingStateUsed:true}).pass,false);
assert.strictEqual(evaluate({candidates:[a],intentStateUsed:true}).pass,false);
console.log('Master 3/7 Best Execution determinism: PASS');
