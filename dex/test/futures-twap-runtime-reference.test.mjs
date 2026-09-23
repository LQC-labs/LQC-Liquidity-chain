import assert from "node:assert/strict";
import fs from "node:fs";
import anvil from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
import { twapTickToScaledPrice } from "../scripts/futures-twap-price-conversion.mjs";

const artifact=(name,source)=>JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url))
);
async function deploy(signer,name,source,args=[]){
  const a=artifact(name,source);
  const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}

describe("Master 7/2 Futures V3 TWAP runtime reference adapter",function(){
  this.timeout(30000);
  let provider,owner,index,quote,pool;

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(anvil.provider({chain:{chainId:97},logging:{quiet:true}}));
    owner=await provider.getSigner(0);
    index=await deploy(owner,"MockERC20","mocks/MockERC20",["Index","IDX"]);
    quote=await deploy(owner,"MockERC20","mocks/MockERC20",["Quote","USD"]);
    pool=await deploy(owner,"MockV3TwapPool","futures/mocks/MockV3TwapPool",[
      await index.getAddress(),await quote.getAddress()
    ]);
    await(await pool.setState(1_000_000,2n**96n,0,2,true,true,0,0)).wait();
  });

  const makeAdapter=async(indexToken=index,quoteToken=quote,minLiquidity=500_000)=>
    deploy(owner,"LQCV3TwapReferenceAdapter","futures/LQCV3TwapReferenceAdapter",[
      await pool.getAddress(),await indexToken.getAddress(),await quoteToken.getAddress(),300,minLiquidity
    ]);

  it("accepts Pancake V3 uint32 feeProtocol values above uint8",async function(){
    const ref=await makeAdapter(index,quote,1);
    await(await pool.setFeeProtocol(0xce40ce40)).wait();
    await(await pool.setState(2_182_852_421_433_811_220n,2n**96n,91749,8,true,true,0,91749*300)).wait();
    const [,answer]=await ref.latestRoundData();
    assert.ok(answer>0n);
  });

  it("matches the existing integer TWAP conversion for positive zero and negative ticks",async function(){
    const ref=await makeAdapter();
    for(const tick of[-600,-1,0,1,600]){
      await(await pool.setState(1_000_000,2n**96n,tick,2,true,true,0,tick*300)).wait();
      const [,answer]=await ref.latestRoundData();
      const expected=twapTickToScaledPrice({
        tick,
        token0:await index.getAddress(),
        token1:await quote.getAddress(),
        indexToken:await index.getAddress(),
        quoteToken:await quote.getAddress(),
        token0Decimals:18,
        token1Decimals:18
      });
      assert.equal(answer,expected,`tick ${tick}`);
    }
  });


  it("reproduces the live BSC Testnet arithmetic mean tick 94548",async function(){
    const ref=await makeAdapter(index,quote,1);
    const liveMeanTick=94548;
    await(await pool.setState(2_182_852_421_433_811_220n,2n**96n,liveMeanTick,8,true,true,0,liveMeanTick*300)).wait();
    const [,answer]=await ref.latestRoundData();
    const expected=twapTickToScaledPrice({
      tick:liveMeanTick,
      token0:await index.getAddress(),
      token1:await quote.getAddress(),
      indexToken:await index.getAddress(),
      quoteToken:await quote.getAddress(),
      token0Decimals:18,
      token1Decimals:18
    });
    assert.equal(answer,expected);
    assert.ok(answer>0n);
  });

  it("reproduces the live BSC inverse-direction mean tick 91749",async function(){
    const ref=await makeAdapter(quote,index,1);
    const liveMeanTick=91749;
    await(await pool.setState(2_182_852_421_433_811_220n,2n**96n,liveMeanTick,8,true,true,0,liveMeanTick*300)).wait();
    const [,answer]=await ref.latestRoundData();
    const expected=twapTickToScaledPrice({
      tick:liveMeanTick,
      token0:await index.getAddress(),
      token1:await quote.getAddress(),
      indexToken:await quote.getAddress(),
      quoteToken:await index.getAddress(),
      token0Decimals:18,
      token1Decimals:18
    });
    assert.equal(answer,expected);
    assert.ok(answer>0n);
  });

  it("matches inverse-pair pricing at the same arithmetic mean tick",async function(){
    const ref=await makeAdapter(quote,index);
    for(const tick of[-300,0,300]){
      await(await pool.setState(1_000_000,2n**96n,tick,2,true,true,0,tick*300)).wait();
      const [,answer]=await ref.latestRoundData();
      const expected=twapTickToScaledPrice({
        tick,
        token0:await index.getAddress(),
        token1:await quote.getAddress(),
        indexToken:await quote.getAddress(),
        quoteToken:await index.getAddress(),
        token0Decimals:18,
        token1Decimals:18
      });
      assert.equal(answer,expected,`inverse tick ${tick}`);
    }
  });

  it("floors negative non-integral arithmetic mean ticks exactly like the qualification gate",async function(){
    const ref=await makeAdapter();
    await(await pool.setState(1_000_000,2n**96n,-1,2,true,true,0,-301)).wait();
    const [,answer]=await ref.latestRoundData();
    const expected=twapTickToScaledPrice({
      tick:-2,
      token0:await index.getAddress(),
      token1:await quote.getAddress(),
      indexToken:await index.getAddress(),
      quoteToken:await quote.getAddress(),
      token0Decimals:18,
      token1Decimals:18
    });
    assert.equal(answer,expected);
  });

  it("fails closed for shallow liquidity locked/uninitialized pools and missing observations",async function(){
    const ref=await makeAdapter();
    for(const state of[
      [499_999,2n**96n,0,2,true,true],
      [1_000_000,0,0,2,true,true],
      [1_000_000,2n**96n,0,2,false,true],
      [1_000_000,2n**96n,0,1,true,true],
      [1_000_000,2n**96n,0,2,true,false]
    ]){
      await(await pool.setState(...state,0,0)).wait();
      await assert.rejects(ref.latestRoundData());
    }
  });

  it("rejects invalid construction boundaries",async function(){
    await assert.rejects(deploy(owner,"LQCV3TwapReferenceAdapter","futures/LQCV3TwapReferenceAdapter",[
      await pool.getAddress(),await index.getAddress(),await quote.getAddress(),299,500_000
    ]));
    await assert.rejects(deploy(owner,"LQCV3TwapReferenceAdapter","futures/LQCV3TwapReferenceAdapter",[
      await pool.getAddress(),await index.getAddress(),await quote.getAddress(),300,0
    ]));
    await assert.rejects(deploy(owner,"LQCV3TwapReferenceAdapter","futures/LQCV3TwapReferenceAdapter",[
      await pool.getAddress(),await index.getAddress(),await index.getAddress(),300,500_000
    ]));
  });

  it("produces a complete AggregatorV3 reference consumable by the current on-chain circuit breaker",async function(){
    const ref=await makeAdapter();
    const primary=await deploy(owner,"MockAggregatorV3","futures/mocks/MockAggregatorV3",[18]);
    const oracle=await deploy(owner,"LQCAggregatorOracleAdapter","futures/LQCAggregatorOracleAdapter",[
      await owner.getAddress()
    ]);
    const now=BigInt((await provider.getBlock("latest")).timestamp);

    await(await primary.setRoundData(1,ethers.parseEther("1"),now,1)).wait();
    await(await oracle.setFeed(await index.getAddress(),await primary.getAddress(),300)).wait();
    await(await oracle.setCircuitBreaker(await index.getAddress(),await ref.getAddress(),100)).wait();

    const [price]=await oracle.getPrice(await index.getAddress());
    assert.equal(price,ethers.parseEther("1"));
  });

  it("contains no state-changing market activation or Futures custody methods",function(){
    const abi=artifact("LQCV3TwapReferenceAdapter","futures/LQCV3TwapReferenceAdapter").abi;
    const names=new Set(abi.filter(x=>x.type==="function").map(x=>x.name));
    for(const forbidden of[
      "setFeed","setCircuitBreaker","addMarket","setMarketActive","openPosition","closePosition",
      "deposit","withdraw","transferOwnership"
    ]) assert.equal(names.has(forbidden),false,forbidden);
  });
});
