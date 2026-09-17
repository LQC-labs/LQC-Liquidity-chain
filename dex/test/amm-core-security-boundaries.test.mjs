import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source=name)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC official 1/7 AMM core security boundaries",function(){
  this.timeout(30000);
  let provider,owner,attacker,factory,router,wbnb,tokenA,tokenB,pair;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  const future=async()=>BigInt((await provider.getBlock("latest")).timestamp+3600);

  beforeEach(async()=>{
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:3}}));
    owner=await provider.getSigner(0); attacker=await provider.getSigner(1);
    factory=await deploy("LQCFlowFactory","LQCFlowFactory",owner,owner.address);
    wbnb=await deploy("MockWBNB","mocks/MockWBNB",owner);
    router=await deploy("LQCFlowRouter","LQCFlowRouter",owner,factory.target,wbnb.target);
    tokenA=await deploy("MockERC20","mocks/MockERC20",owner,"A","A");
    tokenB=await deploy("MockERC20","mocks/MockERC20",owner,"B","B");
    for(const token of [tokenA,tokenB]){await(await token.mint(owner.address,ethers.parseEther("1000"))).wait();await(await token.approve(router.target,ethers.MaxUint256)).wait();}
    await(await router.addLiquidity(tokenA.target,tokenB.target,ethers.parseEther("100"),ethers.parseEther("100"),0,0,owner.address,await future())).wait();
    pair=new ethers.Contract(await factory.getPair(tokenA.target,tokenB.target),artifact("LQCFlowPair").abi,owner);
  });

  it("rejects free output and preserves reserves and balances",async()=>{
    const [r0,r1]=await pair.getReserves(), a0=await tokenA.balanceOf(pair.target), b0=await tokenB.balanceOf(pair.target);
    await assert.rejects(async()=>{const tx=await pair.connect(attacker).swap(0,ethers.parseEther("1"),attacker.address,{gasLimit:1_000_000n});await tx.wait();});
    const [n0,n1]=await pair.getReserves();
    assert.equal(n0,r0); assert.equal(n1,r1); assert.equal(await tokenA.balanceOf(pair.target),a0); assert.equal(await tokenB.balanceOf(pair.target),b0);
  });

  it("rejects invariant-breaking output even after insufficient input is donated",async()=>{
    const [r0,r1]=await pair.getReserves(), t0=await pair.token0();
    const input=t0.toLowerCase()===tokenA.target.toLowerCase()?tokenA:tokenB;
    await(await input.mint(attacker.address,1n)).wait(); await(await input.connect(attacker).transfer(pair.target,1n)).wait();
    await assert.rejects(async()=>{const tx=await pair.connect(attacker).swap(0,ethers.parseEther("1"),attacker.address,{gasLimit:1_000_000n});await tx.wait();});
    const [n0,n1]=await pair.getReserves(); assert.equal(n0,r0); assert.equal(n1,r1);
  });

  it("forbids swap output recipients that are either pool token or zero address",async()=>{
    await assert.rejects(pair.swap(1n,0,tokenA.target));
    await assert.rejects(pair.swap(1n,0,tokenB.target));
    await assert.rejects(pair.swap(1n,0,ethers.ZeroAddress));
  });

  it("keeps Factory ownership two-step and prevents unauthorized takeover",async()=>{
    await assert.rejects(factory.connect(attacker).transferOwnership(attacker.address));
    await(await factory.transferOwnership(attacker.address)).wait();
    await assert.rejects(factory.acceptOwnership());
    assert.equal(await factory.owner(),owner.address);
    await(await factory.connect(attacker).acceptOwnership()).wait();
    assert.equal(await factory.owner(),attacker.address); assert.equal(await factory.pendingOwner(),ethers.ZeroAddress);
  });

  it("rejects reserve overflow atomically on sync",async()=>{
    const max112=(1n<<112n)-1n, current=await tokenA.balanceOf(pair.target);
    await(await tokenA.mint(pair.target,max112-current+1n)).wait();
    const before=await pair.getReserves();
    await assert.rejects(async()=>{const tx=await pair.sync({gasLimit:1_000_000n});await tx.wait();});
    const after=await pair.getReserves(); assert.equal(after[0],before[0]); assert.equal(after[1],before[1]);
  });
});
