#!/usr/bin/env node
'use strict';
const fs=require('fs');
const targets=[
 'dex/contracts/router-v2/LQCQuoteRouter.sol',
 'dex/contracts/router-v2/LQCSplitOptimizer.sol',
 'dex/contracts/router-v2/LQCExecutionRouter.sol',
 'dex/contracts/router-v2/LQCBestExecutionProof.sol',
 'dex/contracts/router-v2/LQCProofBoundExecutionGateway.sol'
];
const findings=[];
const venue=/Pancake|Uniswap|SushiSwap|QuickSwap|Curve|Balancer/i;
const endpoint=/\b(factory|quoter|swapRouter|poolManager)\s*=\s*0x[0-9a-fA-F]{40}/;
for(const file of targets){
 if(!fs.existsSync(file)){findings.push({file,rule:'MISSING_CORE_FILE'});continue;}
 const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
 lines.forEach((line,i)=>{
   const code=line.replace(/\/\/.*$/,'');
   if(venue.test(code))findings.push({file,line:i+1,rule:'VENUE_SPECIFIC_CORE_COUPLING'});
   if(endpoint.test(code))findings.push({file,line:i+1,rule:'HARDCODED_VENUE_ENDPOINT'});
 });
}
const gateway=fs.readFileSync('dex/contracts/router-v2/LQCProofBoundExecutionGateway.sol','utf8');
if(!/executionRouter\.registry\(\)/.test(gateway))findings.push({file:'LQCProofBoundExecutionGateway.sol',rule:'REGISTRY_NOT_CONSULTED'});
if(!/currentAdapter.*selected\.adapter/.test(gateway))findings.push({file:'LQCProofBoundExecutionGateway.sol',rule:'ADAPTER_DRIFT_NOT_BOUND'});
if(!/!enabled/.test(gateway))findings.push({file:'LQCProofBoundExecutionGateway.sol',rule:'DISABLED_ADAPTER_NOT_REJECTED'});
const out={stage:'3/5',pass:findings.length===0,activationAuthorized:false,findings};
console.log(JSON.stringify(out,null,2));process.exit(out.pass?0:1);
