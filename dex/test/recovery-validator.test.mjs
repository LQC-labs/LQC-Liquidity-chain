import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),context={};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/recovery-validator.js'),'utf8'),context);
const address=n=>`0x${n.repeat(40)}`,hash=`0x${'ab'.repeat(32)}`;
const config={chainId:97,quoteRouterAddress:address('1'),executionRouterAddress:address('2'),autoRouterAddress:address('3'),nativeRouterAddress:address('4')};
const health={bindQuote:(quote)=>quote,quoteBindingMatches:()=>true,quoteRequestMatches:()=>true,executionPlanMatches:()=>true,transactionMatches:()=>true};
const validate=context.LQCRecoveryValidator.create({config,ethers:{isAddress:value=>/^0x[0-9a-f]{40}$/i.test(value)},chartHealth:health});
function record(kind='single'){
  const sender=address('5'),tokenIn=address('6'),tokenOut=address('7'),router=kind==='split'?config.autoRouterAddress:kind==='single'?config.executionRouterAddress:config.nativeRouterAddress;
  const request={chainId:97,router:config.quoteRouterAddress,tokenIn,tokenOut,amountIn:10n,routes:['0x'],slippageBps:50},execution={sender,recipient:sender,router,minimumAmountOut:8n,deadline:2,kind},transaction={chainId:97,to:router,data:'0x12345678',value:kind==='native-in'?10n:0n,gasLimit:1n,nonce:0,type:0,gasPrice:1n,maxFeePerGas:null,maxPriorityFeePerGas:null},anchorQuote={dexId:hash,adapter:address('8'),amountOut:9n,priority:1n,blockNumber:1,blockHash:hash,issuedAt:1000,expiresAt:11000,request,execution,transaction};
  const settlementContext=kind==='native-out'?{kind:'native-out',nativeRouter:config.nativeRouterAddress,tokenIn,recipient:sender,amountIn:10n,minimumAmountOut:8n}:{kind:'erc20',tokenOut,recipient:sender,minimumAmountOut:8n};
  return{anchorQuote,settlementContext};
}

describe('LQC pending recovery payload validator',function(){
  it('accepts each transaction kind only with its reviewed router and settlement shape',function(){for(const kind of ['single','split','native-in','native-out'])assert.equal(validate(record(kind)),true)});
  it('rejects cross-chain, wrong-router, account, token, amount, and settlement mutations',function(){
    const mutations=[
      value=>value.anchorQuote.request.chainId=56,
      value=>value.anchorQuote.execution.router=address('9'),
      value=>value.settlementContext.recipient=address('9'),
      value=>value.settlementContext.minimumAmountOut=7n,
      value=>value.settlementContext.tokenOut=address('9')
    ];
    for(const mutate of mutations){const value=record();mutate(value);assert.equal(validate(value),false)}
  });
  it('rejects malformed quote, execution, and transaction bindings',function(){for(const method of ['quoteBindingMatches','quoteRequestMatches','executionPlanMatches','transactionMatches']){const failed={...health,[method]:()=>false},check=context.LQCRecoveryValidator.create({config,ethers:{isAddress:()=>true},chartHealth:failed});assert.equal(check(record()),false)}});
  it('binds native-out recovery to the exact input token and amount',function(){const token=record('native-out');token.settlementContext.tokenIn=address('9');assert.equal(validate(token),false);const amount=record('native-out');amount.settlementContext.amountIn=11n;assert.equal(validate(amount),false)});
});
