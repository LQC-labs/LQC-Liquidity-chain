import assert from "node:assert/strict";
import fs from "node:fs";
import { validateAggregatorOnlyEnv } from "../scripts/prepare-master7-7-7m2-aggregator-only.mjs";

describe("Master 7/7-7M-2 Aggregator-only deployment gate",()=>{
  const owner="0x89d992f696B40ABbDB6610144faeF336911D8175";
  const deployer="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
  it("preserves owner/deployer role separation",()=>assert.deepEqual(validateAggregatorOnlyEnv({FUTURES_OWNER_ADDRESS:owner,FUTURES_DEPLOYER_ADDRESS:deployer}),{owner,deployer}));
  it("rejects owner/deployer collapse",()=>assert.throws(()=>validateAggregatorOnlyEnv({FUTURES_OWNER_ADDRESS:owner,FUTURES_DEPLOYER_ADDRESS:owner}),/separated/));
  it("does not redeploy established Futures components",()=>{
    const s=fs.readFileSync(new URL("../scripts/prepare-master7-7-7m2-aggregator-only.mjs",import.meta.url),"utf8");
    assert.equal(s.includes("LQCV3TwapReferenceAdapter"),false);
    assert.equal(s.includes("LQCFuturesMarketRegistry.sol"),false);
    assert.equal(s.includes("LQCFuturesVault.sol"),false);
    assert.equal(s.includes("LQCPerpEngine.sol"),false);
    assert.match(s,/0x5ae96e36356ac18728804577e926b4b362017c0d/i);
    assert.match(s,/transactionAuthorized:false/);
    assert.match(s,/marketActivationAuthorized:false/);
  });
});
