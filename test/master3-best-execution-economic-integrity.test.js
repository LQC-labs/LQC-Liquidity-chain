'use strict';
const assert=require('assert'),fs=require('fs');
const files=[
 'dex/contracts/router-v2/LQCQuoteRouter.sol',
 'dex/contracts/router-v2/LQCSplitOptimizer.sol',
 'dex/contracts/router-v2/LQCBestExecutionProof.sol'
];
for(const f of files) assert.ok(fs.existsSync(f),`missing ${f}`);
const q=fs.readFileSync(files[0],'utf8');
const s=fs.readFileSync(files[1],'utf8');
const p=fs.readFileSync(files[2],'utf8');
assert.match(q,/netAmountOut/i);
assert.match(q,/gasCostInTokenOut/i);
assert.match(q,/protocolFeeInTokenOut/i);
assert.match(p,/grossAmountOut\s*-\s*totalCost/);
assert.match(p,/minimumAmountOut/);
assert.match(p,/priority/);
assert.match(p,/routeHash/);
assert.match(s,/netAmountOut/i);
console.log('Master 3/6 Best Execution economic integrity structure: PASS');
