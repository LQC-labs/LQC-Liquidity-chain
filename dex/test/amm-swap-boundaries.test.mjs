import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source=name)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC official 1/3 Swap boundaries",function(){
  this.timeout(30000);
  let provider,owner,trader,factory,router,wbnb,a,b,c;
  const deploy=async(name,source,signer,...args)=>{const x=artifact(name,source);const z=await new ethers.ContractFactory(x.abi,x.bytecode,signer).deploy(...args);await z.waitForDeployment();return z};
  const deadline=async()=>BigInt((await provider.getBlock("latest")).timestamp+3600);
  beforeEach(async()=>{
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:3}}));owner=await provider.getSigner(0);trader=await provider.getSigner(1);
    factory=await deploy("LQCFlowFactory","LQCFlowFactory",owner,owner.address);wbnb=await deploy("MockWBNB","mocks/MockWBNB",owner);router=await deploy("LQCFlowRouter","LQCFlowRouter",owner,factory.target,wbnb.target);
    a=await deploy("MockERC20","mocks/MockERC20",owner,"A","A");b=await deploy("MockERC20","mocks/MockERC20",owner,"B","B");c=await deploy("MockERC20","mocks/MockERC20",owner,"C","C");
    for(const t of[a,b,c]){await(await t.mint(owner.address,ethers.parseEther("100000"))).wait();await(await t.approve(router.target,ethers.MaxUint256)).wait();}
    await(await a.mint(trader.address,ethers.parseEther("1000"))).wait();await(await a.connect(trader).approve(router.target,ethers.MaxUint256)).wait();
    await(await router.addLiquidity(a.target,b.target,ethers.parseEther("10000"),ethers.parseEther("10000"),0,0,owner.address,await deadline())).wait();
  });
  it("applies the canonical 30 bps fee to exact-input quotes",async()=>{const input=ethers.parseEther("100");const out=await router.getAmountOut(input,ethers.parseEther("10000"),ethers.parseEther("10000"));const feeInput=input*9970n;const expected=feeInput*ethers.parseEther("10000")/(ethers.parseEther("10000")*10000n+feeInput);assert.equal(out,expected);});
  it("executes exact input and leaves router token balances at zero",async()=>{const input=ethers.parseEther("100"),path=[a.target,b.target],q=await router.getAmountsOut(input,path);await(await router.connect(trader).swapExactTokensForTokens(input,q[1],path,trader.address,await deadline())).wait();assert.equal(await b.balanceOf(trader.address),q[1]);assert.equal(await a.balanceOf(router.target),0n);assert.equal(await b.balanceOf(router.target),0n);});
  it("executes exact output without exceeding amountInMax",async()=>{const output=ethers.parseEther("25"),path=[a.target,b.target],q=await router.getAmountsIn(output,path),before=await a.balanceOf(trader.address);await(await router.connect(trader).swapTokensForExactTokens(output,q[0],path,trader.address,await deadline())).wait();assert.equal(before-await a.balanceOf(trader.address),q[0]);assert.equal(await b.balanceOf(trader.address),output);});
  it("reverts atomically when output minimum or input maximum is violated",async()=>{const path=[a.target,b.target],input=ethers.parseEther("10"),out=await router.getAmountsOut(input,path);const before=await a.balanceOf(trader.address);await assert.rejects(async()=>{const tx=await router.connect(trader).swapExactTokensForTokens(input,out[1]+1n,path,trader.address,await deadline());await tx.wait();});assert.equal(await a.balanceOf(trader.address),before);const need=await router.getAmountsIn(ethers.parseEther("10"),path);await assert.rejects(async()=>{const tx=await router.connect(trader).swapTokensForExactTokens(ethers.parseEther("10"),need[0]-1n,path,trader.address,await deadline());await tx.wait();});assert.equal(await a.balanceOf(trader.address),before);});
  it("executes a two-hop route and keeps every pair reserve backed by balances",async()=>{await(await router.addLiquidity(b.target,c.target,ethers.parseEther("10000"),ethers.parseEther("20000"),0,0,owner.address,await deadline())).wait();const path=[a.target,b.target,c.target],input=ethers.parseEther("20"),q=await router.getAmountsOut(input,path);await(await router.connect(trader).swapExactTokensForTokens(input,q[2],path,trader.address,await deadline())).wait();assert.equal(await c.balanceOf(trader.address),q[2]);for(const [x,y] of[[a,b],[b,c]]){const p=await factory.getPair(x.target,y.target),pair=new ethers.Contract(p,artifact("LQCFlowPair").abi,owner),[r0,r1]=await pair.getReserves(),t0=await pair.token0();const x0=t0.toLowerCase()===x.target.toLowerCase()?x:y,x1=x0===x?y:x;assert.equal(r0,await x0.balanceOf(p));assert.equal(r1,await x1.balanceOf(p));}});
  it("rejects expired swaps before moving user funds",async()=>{const before=await a.balanceOf(trader.address);await assert.rejects(router.connect(trader).swapExactTokensForTokens(1n,0,[a.target,b.target],trader.address,1n));assert.equal(await a.balanceOf(trader.address),before);});
});
