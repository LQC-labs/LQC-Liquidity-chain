#!/usr/bin/env node
'use strict';
const fs=require('fs'), path=require('path');

const ROOT=process.argv[2] || 'dex/contracts/router-v2';
const coreName=/(LQCBestExecutionProof|LQCQuoteRouter|LQCSplitOptimizer|LQCExecutionRouter|LQCProofBoundExecutionGateway)\.sol$/;
const forbidden=[
  {name:'BSC_CHAIN_ID_LITERAL',re:/\b(?:56|97)\b/},
  {name:'RPC_URL',re:/https?:\/\//i},
  {name:'PANCAKE_CORE_NAME',re:/Pancake(?:Swap)?/i},
  {name:'KNOWN_BSC_ADDRESS',re:/0x(?:10ED43C718714eb63d5aA57B78B54704E256024E|55d398326f99059fF775485246999027B3197955)/i}
];

function walk(d,out=[]){if(!fs.existsSync(d))return out;for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p,out):out.push(p)}return out}
const files=walk(ROOT).filter(f=>coreName.test(path.basename(f)));
const findings=[];
for(const file of files){
 const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
 lines.forEach((line,i)=>{
   const stripped=line.replace(/\/\/.*$/,'');
   for(const rule of forbidden) if(rule.re.test(stripped)) findings.push({file,line:i+1,rule:rule.name});
 });
}
const result={stage:'3/2',pass:findings.length===0,activationAuthorized:false,root:ROOT,filesScanned:files.length,findings};
console.log(JSON.stringify(result,null,2));
process.exit(result.pass?0:1);
