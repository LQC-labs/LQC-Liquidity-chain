import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const root=path.resolve(import.meta.dirname,"..");
const app=fs.readFileSync(path.join(root,"app/app.js"),"utf8");
const sdkSource=fs.readFileSync(path.join(root,"app/router-sdk.js"),"utf8");
const planSource=app.slice(app.indexOf("  async function executionPlan("),app.indexOf("  async function validatedExecutionPlan"));
function harness(options={}){
 const context=vm.createContext({});
 vm.runInContext(sdkSource,context);
 const dexes=[{id:"gross",name:"Gross",adapter:"a",gasUnits:220000,priority:1},{id:"net",name:"Net",adapter:"b",gasUnits:220000,priority:1}];
 const observations={};
 Object.assign(context,{
  cfg:{dexes},tokenIn:{address:options.nativeIn?"native":"in"},tokenOut:{address:options.nativeOut?"native":"out"},
  ethers:{},sdk:{...context.LQCRouterSDK,encodeRoutes:()=>["0x","0x"]},
  reliableFeeData:async()=>options.fee??{gasPrice:2n,maxFeePerGas:3n},
  bestQuote:async()=>({best:{amountOut:1100n},dex:dexes[0]}),
  gasCostOracle:{quoteRouteCosts:async(token,units,gasPrice)=>{
   Object.assign(observations,{token,units:Array.from(units),gasPrice});
   if(options.oracleError)throw new Error("StalePrice");
   return options.costs??[200n,10n];
  }},
  rankedRoutes:async(value,route,routes,costs)=>context.LQCRouterSDK.rankRouteQuotes(dexes.map((dex,index)=>({dex,index,routeData:routes[index],amountOut:index?1050n:1100n,cost:costs[index],priority:1}))),
  splitOptimizer:{quoteOptimalSplitCapped:async()=>{
   observations.splitCalled=true;
   return{totalAmountOut:1060n,totalNetAmountOut:options.splitNet??1030n,amountsIn:[500n,500n]};
  }}
 });
 vm.runInContext(planSource,context);
 return{observations,run:()=>vm.runInContext('executionPlan(1000n,["in","out"])',context)};
}
describe("Router UI verified cost selection",()=>{
 it("chooses the smaller gross quote with higher economic net output",async()=>{
  const h=harness(),plan=await h.run();assert.equal(plan.single.dex.id,"net");assert.equal(plan.ranked[0].netAmountOut,1040n);assert.equal(h.observations.gasPrice,3n);assert.equal(plan.gasPrice,h.observations.gasPrice);
 });
 for(const flag of ["nativeIn","nativeOut"])it("uses gas-adjusted ranking for "+flag,async()=>{
  const h=harness({[flag]:true}),plan=await h.run();assert.equal(plan.single.dex.id,"net");assert.equal(plan.oracleReady,true);assert.deepEqual(h.observations.units,[260000n,260000n]);assert.equal(h.observations.splitCalled,undefined);
 });
 it("stops on oracle failure instead of selecting a zero-cost gross quote",async()=>{await assert.rejects(harness({oracleError:true}).run(),/RouteCostUnavailable/)});
 for(const costs of [[1n],[0n,1n],[-1n,1n],[1,1n]])it("rejects unavailable or misaligned route costs "+costs,async()=>{await assert.rejects(harness({costs}).run(),/RouteCostUnavailable/)});
 it("rejects a missing positive gas price",async()=>{await assert.rejects(harness({fee:{gasPrice:0n}}).run(),/RouteCostUnavailable/)});
 it("rejects routes whose costs consume all output",async()=>{await assert.rejects(harness({costs:[1100n,1050n]}).run(),/No executable route/)});
 it("selects a split only when its gas-adjusted output is better",async()=>{const plan=await harness({splitNet:1050n}).run();assert.equal(plan.kind,"split")});
 it("keeps the deployed minimal smoke configuration unchanged",()=>{const config=fs.readFileSync(path.join(root,"app/config.js"),"utf8");assert.match(config,/deploymentMode: "minimal-testnet-smoke"/);assert.match(config,/gasCostOracleAddress: null/);assert.match(app,/ui.net.textContent=t\('netCostUnverified'\)/)});
});

describe("Execution costs remain bound to the reviewed quote",()=>{
 const context=vm.createContext({});vm.runInContext(sdkSource,context);
 const sdk=context.LQCRouterSDK,committed={cost:"10",expectedOut:"1000",minimumOut:"990"};
 it("accepts unchanged costs at the committed minimum",()=>{const result=sdk.validateExecutionCosts(committed,{cost:10n,amountOut:990n});assert.equal(result.netAmountOut,980n);assert.equal(result.minimumNetAmountOut,980n)});
 it("accepts lower costs without lowering the gross minimum",()=>{assert.equal(sdk.validateExecutionCosts(committed,{cost:5n,amountOut:990n}).netAmountOut,985n);assert.throws(()=>sdk.validateExecutionCosts(committed,{cost:0n,amountOut:989n}),/ProofNetChanged/)});
 it("rejects a cost increase even if gross output improved",()=>{assert.throws(()=>sdk.validateExecutionCosts(committed,{cost:11n,amountOut:1100n}),/ProofCostChanged/)});
 it("rejects unavailable, negative or non-bigint live costs",()=>{for(const cost of [undefined,-1n,10])assert.throws(()=>sdk.validateExecutionCosts(committed,{cost,amountOut:1000n}),/RouteCostUnavailable/)});
 it("rejects a reviewed minimum consumed by costs",()=>{assert.throws(()=>sdk.validateExecutionCosts({...committed,cost:"990"},{cost:10n,amountOut:1000n}),/RouteCostUnavailable/)});
 it("rejects malformed committed costs",()=>{assert.throws(()=>sdk.validateExecutionCosts({...committed,cost:"-1"},{cost:10n,amountOut:1000n}),/RouteCostUnavailable/)});
 it("offers quote recovery for changed economic conditions",()=>{for(const message of ["ProofCostChanged","ProofNetChanged"]){assert.equal(sdk.explainSwapError(new Error(message)).code,"STALE_QUOTE");assert.equal(sdk.recoveryActionForError(new Error(message)),"REFRESH_QUOTE")}});

 const validatedSource=app.slice(app.indexOf("  async function validatedExecutionPlan("),app.indexOf("  async function minimalQuote("));
 function liveHarness(split=false,cost=11n){
  const dex={id:"a"},other={id:"b"},plan=split?{kind:"split",split:{totalAmountOut:1000n,amountsOut:[500n,500n]},summary:[{dex,amountIn:500n},{dex:other,amountIn:500n}],costs:[cost,5n]}:{kind:"single",single:{dex,best:{amountOut:1000n}},costs:[cost]};
  const c=vm.createContext({cfg:{chainId:97,dexes:[dex,other]},quoteSnapshot:{},displayedProof:{plan:committed},provider:{getBlockNumber:async()=>1},executionPlan:async()=>plan,ethers:{},Date,sdk:{...sdk,validateExecutionQuote:()=>{},validateExecutionPlanProof:()=>{c.verified=true}}});
  vm.runInContext(validatedSource,c);return c;
 }
 it("checks live single-route costs after verifying the reviewed proof",async()=>{const c=liveHarness();await assert.rejects(vm.runInContext('validatedExecutionPlan(1000n,["in","out"])',c),/ProofCostChanged/);assert.equal(c.verified,true)});
 it("sums costs of every active split leg",async()=>{const c=liveHarness(true,6n);await assert.rejects(vm.runInContext('validatedExecutionPlan(1000n,["in","out"])',c),/ProofCostChanged/)});
 it("allows a split whose combined costs remain within the reviewed ceiling",async()=>{const c=liveHarness(true,5n);assert.equal((await vm.runInContext('validatedExecutionPlan(1000n,["in","out"])',c)).kind,"split")});

 const refreshSource=app.slice(app.indexOf("  const economicQuoteChanged="),app.indexOf("  async function planPriceImpact("));
 it("still retries an expired minimal quote after refreshing",async()=>{
  const c=vm.createContext({minimalMode:true,quoteSnapshot:{},status:()=>{},t:key=>key,validatedMinimalExecutionPlan:async()=>{if(++c.attempts===1)throw new Error("StaleQuote");return{kind:"minimal"}},quote:async()=>{c.refreshed++},attempts:0,refreshed:0});
  vm.runInContext(refreshSource,c);assert.equal((await vm.runInContext('freshExecutionPlan(1000n,["in","out"])',c)).kind,"minimal");assert.equal(c.attempts,2);assert.equal(c.refreshed,1);
 });
 for(const message of ["ProofCostChanged","ProofNetChanged"])it("refreshes but requires another user action after "+message,async()=>{
  const c=vm.createContext({minimalMode:false,quoteSnapshot:{},status:()=>{},t:key=>key,validatedExecutionPlan:async()=>{c.attempts++;throw new Error(message)},quote:async()=>{c.refreshed++},attempts:0,refreshed:0});
  vm.runInContext(refreshSource,c);await assert.rejects(vm.runInContext('freshExecutionPlan(1000n,["in","out"])',c),new RegExp(message));assert.equal(c.attempts,1);assert.equal(c.refreshed,1);
 });
});
