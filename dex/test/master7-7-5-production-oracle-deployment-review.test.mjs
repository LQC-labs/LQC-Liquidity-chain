import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildProductionOracleDeploymentReview } from "../scripts/build-master7-7-5-production-oracle-deployment-review.mjs";

const env = {
  FUTURES_OWNER_ADDRESS: "0x89d992f696B40ABbDB6610144faeF336911D8175",
  FUTURES_DEPLOYER_ADDRESS: "0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB",
  FUTURES_DEPLOYER_NONCE: "7",
  FUTURES_INDEX_TOKEN: "0x1111111111111111111111111111111111111111",
  FUTURES_QUOTE_TOKEN: "0x2222222222222222222222222222222222222222",
  FUTURES_PRIMARY_FEED: "0x3333333333333333333333333333333333333333",
  FUTURES_TWAP_POOL: "0x4444444444444444444444444444444444444444",
  FUTURES_FEED_HEARTBEAT: "3600",
  FUTURES_MAX_DEVIATION_BPS: "500",
  FUTURES_TWAP_WINDOW: "1800",
  FUTURES_TWAP_MIN_LIQUIDITY: "1"
};

describe("Master 7/7-5 production Oracle deployment review", () => {
  it("builds two deterministic deployment actions without authorizing transactions", async () => {
    const r = buildProductionOracleDeploymentReview(env);
    assert.equal(r.chainId, 97);
    assert.equal(r.transactionAuthorized, false);
    assert.equal(r.deployments.length, 2);
    assert.equal(r.governanceActions.length, 2);
    assert.equal(r.deployments[0].predictedAddress, ethers.getCreateAddress({from:env.FUTURES_DEPLOYER_ADDRESS,nonce:7n}));
    assert.equal(r.deployments[1].predictedAddress, ethers.getCreateAddress({from:env.FUTURES_DEPLOYER_ADDRESS,nonce:8n}));
    assert.match(r.deployments[0].data, /^0x[0-9a-f]+$/i);
    assert.match(r.deployments[1].data, /^0x[0-9a-f]+$/i);
    assert.match(r.governanceActions[0].data, /^0x[0-9a-f]+$/i);
    assert.match(r.governanceActions[1].data, /^0x[0-9a-f]+$/i);
  });

  it("fails closed when deployer nonce is absent or malformed", () => {
    assert.throws(() => buildProductionOracleDeploymentReview({...env,FUTURES_DEPLOYER_NONCE:""}));
    assert.throws(() => buildProductionOracleDeploymentReview({...env,FUTURES_DEPLOYER_NONCE:"abc"}));
  });
});
