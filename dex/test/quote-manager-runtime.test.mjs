import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const A=JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/intent-v1/LQCQuoteManager.sol/LQCQuoteManager.json",import.meta.url)));
const deploy=async(s,...args)=>{const c=await new ethers.ContractFactory(A.abi,A.bytecode,s).deploy(...args);await c.waitForDeployment();return c;};
async function fails(action){await assert.rejects(action,e=>e.code==="CALL_EXCEPTION"||/revert|missing revert data/i.test(String(e)));}

describe("7/5 QuoteManager EVM runtime gate",function(){
 this.timeout(30000);let chain,provider,owner,guardian,solver,other,qm;
 beforeEach(async()=>{chain=ganache.provider({chain:{chainId:97,hardfork:"shanghai"},logging:{quiet:true},wallet:{deterministic:true,totalAccounts:5}});provider=new ethers.BrowserProvider(chain,undefined,{cacheTimeout:-1});provider.pollingInterval=10;[owner,guardian,solver,other]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));qm=await deploy(owner,await owner.getAddress(),await guardian.getAddress());});
 afterEach(async()=>{provider.destroy();await chain.disconnect();});
 async function quote(suffix="a"){const b=await provider.getBlock("latest");return{intentHash:ethers.id("intent-"+suffix),solver:await solver.getAddress(),amountOut:1000n,gasCostOut:10n,priceImpactBps:25n,expiresAt:BigInt(b.timestamp+3600),routeHash:ethers.id("route-"+suffix)};}
 it("stores and verifies a canonical domain-separated solver quote",async()=>{const q=await quote();const h=await qm.hashQuote(q);await(await qm.connect(solver).submitQuote(q)).wait();assert.equal(await qm.quoteHashes(q.intentHash,q.solver),h);assert.equal(await qm.verifyQuote(q),true);});
 it("binds every economic and routing field",async()=>{const q=await quote("bind");await(await qm.connect(solver).submitQuote(q)).wait();for(const [k,v] of [["amountOut",1001n],["gasCostOut",11n],["priceImpactBps",26n],["routeHash",ethers.id("other")]])assert.equal(await qm.verifyQuote({...q,[k]:v}),false);});
 it("rejects solver impersonation and invalid economics",async()=>{const q=await quote("auth");await fails(()=>qm.connect(other).submitQuote.staticCall(q));await fails(()=>qm.connect(solver).submitQuote.staticCall({...q,gasCostOut:q.amountOut}));await fails(()=>qm.connect(solver).submitQuote.staticCall({...q,priceImpactBps:10001n}));});
 it("rejects expired quotes",async()=>{const q=await quote("expired");const b=await provider.getBlock("latest");await fails(()=>qm.connect(solver).submitQuote.staticCall({...q,expiresAt:BigInt(b.timestamp)}));});
 it("guardian pause blocks new risk intake and owner can resume",async()=>{const q=await quote("pause");await(await qm.connect(guardian).setPaused(true)).wait();await fails(()=>qm.connect(solver).submitQuote.staticCall(q));await(await qm.connect(owner).setPaused(false)).wait();await(await qm.connect(solver).submitQuote(q)).wait();assert.equal(await qm.verifyQuote(q),true);});
});
