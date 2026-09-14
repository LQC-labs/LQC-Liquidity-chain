import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { PANCAKE_BSC_TESTNET } from "../scripts/validate-bsc-testnet.mjs";
import {
  PILOT_FEE,
  TEST_LQC,
  TEST_WBNB,
  buildPancakeV3PoolTransaction,
} from "../scripts/prepare-pancake-v3-pool.mjs";

describe("PancakeSwap V3 empty-pool preparation", function () {
  it("builds only the reviewed chain-97 tLQC/WBNB fee-2500 createPool call", function () {
    const bundle = buildPancakeV3PoolTransaction();
    assert.equal(bundle.network.chainId, 97);
    assert.equal(bundle.transaction.to, PANCAKE_BSC_TESTNET.v3Factory);
    assert.equal(bundle.transaction.value, "0");
    assert.equal(bundle.fee, 2500);
    assert.match(bundle.scope, /does not approve tokens, set the initial price, or add liquidity/);
    const factory = new ethers.Interface(["function createPool(address,address,uint24) returns(address)"]);
    const [tokenA, tokenB, fee] = factory.decodeFunctionData("createPool", bundle.transaction.data);
    assert.equal(tokenA, TEST_LQC);
    assert.equal(tokenB, TEST_WBNB);
    assert.equal(Number(fee), PILOT_FEE);
  });

  it("keeps the TokenPocket transaction and read checks identical to the generator", function () {
    const bundle = buildPancakeV3PoolTransaction();
    const source = fs.readFileSync(new URL("../app/pancake-v3-pool-testnet.js", import.meta.url), "utf8");
    const constant = (name) => source.match(new RegExp(`const ${name} = "(0x[0-9a-f]+)";`))?.[1];
    assert.equal(constant("CREATE_DATA"), bundle.transaction.data);
    assert.equal(constant("GET_POOL_DATA"), bundle.readChecks.getPoolData);
    assert.equal(constant("FEE_SPACING_DATA"), bundle.readChecks.feeSpacingData);
    assert.match(source, /초기 가격과 유동성은 아직 설정하지 않습니다/);
    assert.match(source, /풀이 이미 생성되어 있습니다\. 다시 생성하지 마세요/);
  });

  it("shows the limited empty-pool scope before either wallet action", function () {
    const html = fs.readFileSync(new URL("../app/pancake-v3-pool-testnet.html", import.meta.url), "utf8");
    assert.match(html, /토큰 승인, 초기 가격 설정, 유동성 공급은 하지 않습니다/);
    assert.match(html, /2\. 빈 V3 풀 생성/);
  });
});
