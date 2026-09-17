import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source=name)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC official 1/1 AMM Factory / Pair boundaries",function(){
  this.timeout(30000);
  let provider,owner,factory,tokenA,tokenB;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};

  beforeEach(async()=>{
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);
    factory=await deploy("LQCFlowFactory","LQCFlowFactory",owner,owner.address);
    tokenA=await deploy("MockERC20","mocks/MockERC20",owner,"Token A","TKA");
    tokenB=await deploy("MockERC20","mocks/MockERC20",owner,"Token B","TKB");
  });

  it("rejects identical-token and zero-address pairs without changing pair count",async()=>{
    assert.equal(await factory.allPairsLength(),0n);
    await assert.rejects(factory.createPair(tokenA.target,tokenA.target));
    await assert.rejects(factory.createPair(ethers.ZeroAddress,tokenA.target));
    await assert.rejects(factory.createPair(tokenA.target,ethers.ZeroAddress));
    assert.equal(await factory.allPairsLength(),0n);
  });

  it("sorts token addresses and records symmetric lookup plus allPairs",async()=>{
    await(await factory.createPair(tokenA.target,tokenB.target)).wait();
    const pairAddress=await factory.getPair(tokenA.target,tokenB.target);
    assert.notEqual(pairAddress,ethers.ZeroAddress);
    assert.equal(await factory.getPair(tokenB.target,tokenA.target),pairAddress);
    assert.equal(await factory.allPairsLength(),1n);
    assert.equal(await factory.allPairs(0),pairAddress);
    const pair=new ethers.Contract(pairAddress,artifact("LQCFlowPair").abi,owner);
    const expected0=BigInt(tokenA.target)<BigInt(tokenB.target)?tokenA.target:tokenB.target;
    const expected1=expected0===tokenA.target?tokenB.target:tokenA.target;
    assert.equal(await pair.token0(),expected0);
    assert.equal(await pair.token1(),expected1);
    assert.equal(await pair.factory(),factory.target);
  });

  it("rejects duplicate creation in either token order and preserves the original pair",async()=>{
    await(await factory.createPair(tokenA.target,tokenB.target)).wait();
    const original=await factory.getPair(tokenA.target,tokenB.target);
    await assert.rejects(factory.createPair(tokenA.target,tokenB.target));
    await assert.rejects(factory.createPair(tokenB.target,tokenA.target));
    assert.equal(await factory.allPairsLength(),1n);
    assert.equal(await factory.getPair(tokenA.target,tokenB.target),original);
    assert.equal(await factory.getPair(tokenB.target,tokenA.target),original);
  });

  it("keeps minimum liquidity permanently locked after initial mint",async()=>{
    await(await factory.createPair(tokenA.target,tokenB.target)).wait();
    const pairAddress=await factory.getPair(tokenA.target,tokenB.target);
    const pair=new ethers.Contract(pairAddress,artifact("LQCFlowPair").abi,owner);
    await(await tokenA.mint(owner.address,ethers.parseEther("10"))).wait();
    await(await tokenB.mint(owner.address,ethers.parseEther("10"))).wait();
    await(await tokenA.transfer(pairAddress,ethers.parseEther("10"))).wait();
    await(await tokenB.transfer(pairAddress,ethers.parseEther("10"))).wait();
    await(await pair.mint(owner.address)).wait();
    assert.equal(await pair.balanceOf("0x0000000000000000000000000000000000000001"),1000n);
    assert((await pair.totalSupply())>1000n);
  });
});
