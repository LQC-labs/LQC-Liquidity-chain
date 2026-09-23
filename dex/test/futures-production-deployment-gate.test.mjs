import assert from "node:assert/strict";
import { ethers } from "ethers";
import { validateProductionDeploymentAuthorization } from "../scripts/deploy-futures-production.mjs";

const key="0x"+"11".repeat(32);
const signer=new ethers.Wallet(key);
const base={
  FUTURES_OWNER_ADDRESS:"0x89d992f696B40ABbDB6610144faeF336911D8175",
  FUTURES_DEPLOYER_ADDRESS:signer.address,
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
    assert.throws(()=>validateProductionDeploymentAuthorization({...base,DEPLOYER_PRIVATE_KEY:key}),/authorization/);
  });
  it("requires the runtime key after explicit authorization",()=>{
    assert.throws(()=>validateProductionDeploymentAuthorization({...base,FUTURES_EXECUTE_PRODUCTION_DEPLOYMENT:"I_UNDERSTAND_THIS_SENDS_BSC_TESTNET_TRANSACTIONS"}),/PRIVATE_KEY/);
  });
  it("accepts a separately authorized chain-97 production-equivalent config without activating markets",()=>{
    const r=validateProductionDeploymentAuthorization({...base,DEPLOYER_PRIVATE_KEY:key,FUTURES_EXECUTE_PRODUCTION_DEPLOYMENT:"I_UNDERSTAND_THIS_SENDS_BSC_TESTNET_TRANSACTIONS"});
    assert.equal(r.chainId,97);
    assert.equal(r.transactionAuthorized,false);
    assert.equal(r.primaryAdapter,"LQCAggregatorOracleAdapter");
    assert.equal(r.referenceAdapter,"LQCV3TwapReferenceAdapter");
  });
});
