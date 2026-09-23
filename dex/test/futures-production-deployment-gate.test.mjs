import assert from "node:assert/strict";
import fs from "node:fs";
import { validateProductionDeploymentAuthorization,assertProductionDeploymentNetwork } from "../scripts/deploy-futures-production.mjs";
const base={FUTURES_OWNER_ADDRESS:"0x89d992f696B40ABbDB6610144faeF336911D8175",FUTURES_INDEX_TOKEN:"0x1111111111111111111111111111111111111111",FUTURES_QUOTE_TOKEN:"0x2222222222222222222222222222222222222222",FUTURES_PRIMARY_FEED:"0x3333333333333333333333333333333333333333",FUTURES_TWAP_POOL:"0x4444444444444444444444444444444444444444",FUTURES_FEED_HEARTBEAT:"3600",FUTURES_MAX_DEVIATION_BPS:"500",FUTURES_TWAP_WINDOW:"1800",FUTURES_TWAP_MIN_LIQUIDITY:"1"};
describe("Production-equivalent Futures deployment gate",()=>{
 it("fails closed without explicit transaction authorization",()=>assert.throws(()=>validateProductionDeploymentAuthorization(base),/authorization/));
 it("requires runtime signing material only after explicit authorization",()=>assert.throws(()=>validateProductionDeploymentAuthorization({...base,FUTURES_EXECUTE_PRODUCTION_DEPLOYMENT:"I_UNDERSTAND_THIS_SENDS_BSC_TESTNET_TRANSACTIONS"}),/PRIVATE_KEY/));
 it("rejects a non-BSC-Testnet provider before deployment",async()=>{await assert.rejects(()=>assertProductionDeploymentNetwork({getNetwork:async()=>({chainId:56n})}),/chain 97/);});
 it("accepts chain 97 without sending a transaction",async()=>{assert.equal(await assertProductionDeploymentNetwork({getNetwork:async()=>({chainId:97n})}),true);});
 it("uses current production Oracle/TWAP artifacts and never auto-activates a market",()=>{const s=fs.readFileSync(new URL("../scripts/deploy-futures-production.mjs",import.meta.url),"utf8");assert.equal(s.includes("MockLQCFuturesOracle"),false);assert.equal(s.includes("LQCAggregatorOracleAdapter"),true);assert.equal(s.includes("LQCV3TwapReferenceAdapter"),true);assert.equal(s.includes("marketActivationAuthorized:false"),true);assert.equal(s.includes(".addMarket("),false);});
});
