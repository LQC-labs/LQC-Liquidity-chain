import assert from "node:assert/strict";
import fs from "node:fs";
import { validateProductionDeploymentAuthorization } from "../scripts/deploy-futures-production.mjs";

const base={
  FUTURES_OWNER_ADDRESS:"0x89d992f696B40ABbDB6610144faeF336911D8175",
  FUTURES_INDEX_TOKEN:"0x1111111111111111111111111111111111111111",
  FUTURES_QUOTE_TOKEN:"0x2222222222222222222222222222222222222222",
  FUTURES_PRIMARY_FEED:"0x3333333333333333333333333333333333333333",
  FUTURES_TWAP_POOL:"0x4444444444444444444444444444444444444444",
  FUTURES_FEED_HEARTBEAT:"3600",
  FUTURES_MAX_DEVIATION_BPS:"500",
  FUTURES_TWAP_WINDOW:"1800",
  FUTURES_TWAP_MIN_LIQUIDITY:"1"
};

describe("Production-equivalent Futures deployment authorization",()=>{
  it("fails closed without explicit transaction authorization",()=>{
    assert.throws(()=>validateProductionDeploymentAuthorization(base),/authorization/);
  });
  it("requires runtime signing material only after explicit authorization",()=>{
    assert.throws(()=>validateProductionDeploymentAuthorization({
      ...base,
      FUTURES_EXECUTE_PRODUCTION_DEPLOYMENT:"I_UNDERSTAND_THIS_SENDS_BSC_TESTNET_TRANSACTIONS"
    }),/PRIVATE_KEY/);
  });
  it("contains no test-only Mock Oracle deployment dependency",()=>{
    const source=fs.readFileSync(new URL("../scripts/deploy-futures-production.mjs",import.meta.url),"utf8");
    assert.equal(source.includes("MockLQCFuturesOracle"),false);
    assert.equal(source.includes("LQCAggregatorOracleAdapter"),true);
    assert.equal(source.includes("LQCV3TwapReferenceAdapter"),true);
    assert.equal(source.includes("marketActivationAuthorized: false"),true);
  });
});
