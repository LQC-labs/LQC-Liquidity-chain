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
  const h=harness(),plan=await h.run();assert.equal(plan.single.dex.id,"net");assert.equal(plan.ranked[0].netAmountOut,1040n);assert.equal(h.observations.gasPrice,3n);
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
