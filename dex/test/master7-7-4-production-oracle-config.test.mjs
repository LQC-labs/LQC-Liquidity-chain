import assert from "node:assert/strict";
import { validateProductionOracleConfig } from "../scripts/verify-master7-7-4-production-oracle-config.mjs";

const base = {
  FUTURES_OWNER_ADDRESS: "0x89d992f696B40ABbDB6610144faeF336911D8175",
  FUTURES_INDEX_TOKEN: "0x1111111111111111111111111111111111111111",
  FUTURES_QUOTE_TOKEN: "0x2222222222222222222222222222222222222222",
  FUTURES_PRIMARY_FEED: "0x3333333333333333333333333333333333333333",
  FUTURES_TWAP_POOL: "0x4444444444444444444444444444444444444444",
  FUTURES_FEED_HEARTBEAT: "3600",
  FUTURES_MAX_DEVIATION_BPS: "500",
  FUTURES_TWAP_WINDOW: "1800",
  FUTURES_TWAP_MIN_LIQUIDITY: "1"
};

describe("Master 7/7-4 production-equivalent Oracle config gate", () => {
  it("accepts a bounded production Oracle configuration without authorizing a transaction", () => {
    const r = validateProductionOracleConfig(base);
    assert.equal(r.chainId, 97);
    assert.equal(r.transactionAuthorized, false);
    assert.equal(r.primaryAdapter, "LQCAggregatorOracleAdapter");
    assert.equal(r.referenceAdapter, "LQCV3TwapReferenceAdapter");
  });

  it("fails closed on zero/invalid heartbeat", () => {
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_FEED_HEARTBEAT:"0"}), /heartbeat/);
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_FEED_HEARTBEAT:"86401"}), /heartbeat/);
  });

  it("fails closed on unsafe deviation", () => {
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_MAX_DEVIATION_BPS:"0"}), /Deviation|deviation/);
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_MAX_DEVIATION_BPS:"5001"}), /Deviation|deviation/);
  });

  it("fails closed on unsafe TWAP window", () => {
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_TWAP_WINDOW:"299"}), /TWAP window/);
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_TWAP_WINDOW:"86401"}), /TWAP window/);
  });

  it("fails closed on zero liquidity or same token pair", () => {
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_TWAP_MIN_LIQUIDITY:"0"}), /minimumLiquidity/);
    assert.throws(() => validateProductionOracleConfig({...base,FUTURES_QUOTE_TOKEN:base.FUTURES_INDEX_TOKEN}), /must differ/);
  });
});
