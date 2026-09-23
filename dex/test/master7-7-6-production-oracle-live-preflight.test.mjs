import assert from "node:assert/strict";
import { preflightProductionOracleDeployment } from "../scripts/preflight-master7-7-6-production-oracle-live.mjs";

const env = {
  BSC_TESTNET_RPC_URL: "http://unused",
  FUTURES_OWNER_ADDRESS: "0x89d992f696B40ABbDB6610144faeF336911D8175",
  FUTURES_INDEX_TOKEN: "0x1111111111111111111111111111111111111111",
  FUTURES_QUOTE_TOKEN: "0x2222222222222222222222222222222222222222",
  FUTURES_PRIMARY_FEED: "0x3333333333333333333333333333333333333333",
  FUTURES_TWAP_POOL: "0x4444444444444444444444444444444444444444",
  FUTURES_FEED_HEARTBEAT: "3600",
  FUTURES_MAX_DEVIATION_BPS: "500",
  FUTURES_TWAP_WINDOW: "1800",
  FUTURES_TWAP_MIN_LIQUIDITY: "100"
};

class MockProvider {
  async getNetwork(){ return {chainId:97n}; }
  async getCode(){ return "0x1234"; }
  async getBlock(){ return {number:123,timestamp:10000}; }
  async call(tx){
    const sig=tx.data.slice(0,10);
    const enc=(types,values)=>"0x"+new (await import("ethers")).ethers.AbiCoder().encode(types,values).slice(2);
    throw new Error("unexpected call "+sig);
  }
}

describe("Master 7/7-6 production Oracle live preflight", () => {
  it("exports a read-only preflight function", () => {
    assert.equal(typeof preflightProductionOracleDeployment, "function");
  });
  it("fails closed on wrong chain before any transaction", async () => {
    const provider={getNetwork:async()=>({chainId:56n})};
    await assert.rejects(()=>preflightProductionOracleDeployment(env,provider),/chainId 97/);
  });
});
