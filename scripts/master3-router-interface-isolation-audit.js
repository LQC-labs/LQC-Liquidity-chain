#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const root=process.argv[2]||'dex/contracts/router-v2';
const core=/(LQCBestExecutionProof|LQCQuoteRouter|LQCSplitOptimizer|LQCExecutionRouter|LQCProofBoundExecutionGateway)\.sol$/;
const forbidden=[
 {rule:'FUTURES_STATE',re:/\b(position|leverage|margin|fundingRate|maintenanceMargin)\b/i},
 {rule:'LENDING_STATE',re:/\b(debt|collateral|healthFactor|interestIndex|liquidationBonus)\b/i},
 {rule:'STAKING_STATE',re:/\b(stakingShares|rewardDebt|cooldown|unstake)\b/i},
 {rule:'INTENT_CUSTODY_STATE',re:/\b(sourceEscrow|intentLifecycle|escrowBalance)\b/i},
 {rule:'SETTLEMENT_FINALITY_STATE',re:/\b(settlementFinality|bridgeState|crossChainFinality)\b/i}
];
function walk(d,o=[]){if(!fs.existsSync(d))return o;for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p,o):o.push(p)}return o}
const files=walk(root).filter(f=>core.test(path.basename(f))), findings=[];
for(const file of files){const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);lines.forEach((line,i)=>{
 const code=line.replace(/\/\/.*$/,'').replace(/\/\*[\s\S]*?\*\//g,'');
 for(const x of forbidden)if(x.re.test(code))findings.push({file,line:i+1,rule:x.rule});
});}
const out={stage:'3/4',pass:findings.length===0,activationAuthorized:false,filesScanned:files.length,findings};
console.log(JSON.stringify(out,null,2));process.exit(out.pass?0:1);
