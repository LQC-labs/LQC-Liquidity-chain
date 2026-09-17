import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source=name)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC official 1/2 Liquidity boundaries",function(){
  this.timeout(30000);
  let provider,owner,factory,router,wbnb,tokenA,tokenB;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  const deadline=async()=>BigInt((await provider.getBlock("latest")).timestamp+3600);

  beforeEach(async()=>{
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);
    factory=await deploy("LQCFlowFactory","LQCFlowFactory",owner,owner.address);
    wbnb=await deploy("MockWBNB","mocks/MockWBNB",owner);
    router=await deploy("LQCFlowRouter","LQCFlowRouter",owner,factory.target,wbnb.target);
    tokenA=await deploy("MockERC20","mocks/MockERC20",owner,"Token A","TKA");
    tokenB=await deploy("MockERC20","mocks/MockERC20",owner,"Token B","TKB");
    for(const token of [tokenA,tokenB]){
      await(await token.mint(owner.address,ethers.parseEther("1000"))).wait();
      await(await token.approve(router.target,ethers.MaxUint256)).wait();
    }
  });

  it("mints LP from initial liquidity and keeps reserves equal to pair balances",async()=>{
    await(await router.addLiquidity(tokenA.target,tokenB.target,ethers.parseEther("10"),ethers.parseEther("20"),0,0,owner.address,await deadline())).wait();
    const pairAddress=await factory.getPair(tokenA.target,tokenB.target);
    const pair=new ethers.Contract(pairAddress,artifact("LQCFlowPair").abi,owner);
    const [r0,r1]=await pair.getReserves();
    assert.equal(r0,await new ethers.Contract(await pair.token0(),artifact("MockERC20","mocks/MockERC20").abi,owner).balanceOf(pairAddress));
    assert.equal(r1,await new ethers.Contract(await pair.token1(),artifact("MockERC20","mocks/MockERC20").abi,owner).balanceOf(pairAddress));
    assert((await pair.balanceOf(owner.address))>0n);
  });

  it("adds only the reserve-ratio optimal amounts on later deposits",async()=>{
    await(await router.addLiquidity(tokenA.target,tokenB.target,ethers.parseEther("10"),ethers.parseEther("20"),0,0,owner.address,await deadline())).wait();
    const a0=await tokenA.balanceOf(owner.address), b0=await tokenB.balanceOf(owner.address);
    await(await router.addLiquidity(tokenA.target,tokenB.target,ethers.parseEther("10"),ethers.parseEther("100"),0,0,owner.address,await deadline())).wait();
    assert.equal(a0-await tokenA.balanceOf(owner.address),ethers.parseEther("10"));
    assert.equal(b0-await tokenB.balanceOf(owner.address),ethers.parseEther("20"));
  });

  it("reverts an add when reserve-ratio optimization violates the requested minimum",async()=>{
    await(await router.addLiquidity(tokenA.target,tokenB.target,ethers.parseEther("10"),ethers.parseEther("20"),0,0,owner.address,await deadline())).wait();
    const count=await factory.allPairsLength();
    await assert.rejects(async()=>{const tx=await router.addLiquidity(tokenA.target,tokenB.target,ethers.parseEther("10"),ethers.parseEther("100"),0,ethers.parseEther("21"),owner.address,await deadline());await tx.wait();});
    assert.equal(await factory.allPairsLength(),count);
  });

  it("burns approved LP and returns proportional underlying assets",async()=>{
    await(await router.addLiquidity(tokenA.target,tokenB.target,ethers.parseEther("10"),ethers.parseEther("20"),0,0,owner.address,await deadline())).wait();
    const pairAddress=await factory.getPair(tokenA.target,tokenB.target);
    const pair=new ethers.Contract(pairAddress,artifact("LQCFlowPair").abi,owner);
    const lp=await pair.balanceOf(owner.address);
    await(await pair.approve(router.target,lp)).wait();
    const a0=await tokenA.balanceOf(owner.address),b0=await tokenB.balanceOf(owner.address);
    await(await router.removeLiquidity(tokenA.target,tokenB.target,lp,1,1,owner.address,await deadline())).wait();
    assert((await tokenA.balanceOf(owner.address))>a0);
    assert((await tokenB.balanceOf(owner.address))>b0);
    assert.equal(await pair.balanceOf(owner.address),0n);
    assert.equal(await pair.balanceOf("0x0000000000000000000000000000000000000001"),1000n);
  });
});
