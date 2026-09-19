import assert from "node:assert/strict";
import {
  assertMobileDeploymentContext,
  assertMobileDeploymentBudget,
  assertMobileCumulativeBudget,
  connectApprovedMobileWallet,
  requestExplicitTransaction,
  MOBILE_FUTURES_DEPLOYMENT,
} from "../app/futures/mobile-testnet-deployment.js";

describe("Futures mobile testnet wallet gate", () => {
  it("pins BSC Testnet, deployer, separated owner and budget limits", () => {
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.chainId, 97);
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.deployer, "0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB");
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.owner, "0x89d992f696B40ABbDB6610144faeF336911D8175");
    assert.notEqual(MOBILE_FUTURES_DEPLOYMENT.deployer.toLowerCase(), MOBILE_FUTURES_DEPLOYMENT.owner.toLowerCase());
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.minReserveWei, "300000000000000000");
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.maxDeploymentSpendWei, "1000000000000000000");
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.privateKeyInputSupported, false);
    assert.doesNotThrow(() => assertMobileDeploymentContext({chainId:"0x61",account:MOBILE_FUTURES_DEPLOYMENT.deployer}));
  });
  it("rejects wrong network and wrong signer", () => {
    assert.throws(() => assertMobileDeploymentContext({chainId:"0x38",account:MOBILE_FUTURES_DEPLOYMENT.deployer}), /Wrong network/);
    assert.throws(() => assertMobileDeploymentContext({chainId:"0x61",account:"0x1111111111111111111111111111111111111111"}), /Wrong signer/);
  });
  it("preserves the 0.3 tBNB reserve and 1.0 tBNB spend cap", () => {
    assert.equal(assertMobileDeploymentBudget({balanceWei:"1300000000000000000",estimatedCostWei:"10000000000000000"}),1290000000000000000n);
    assert.throws(() => assertMobileDeploymentBudget({balanceWei:"300000000000000000",estimatedCostWei:"1"}), /0.3 tBNB reserve/);
    assert.throws(() => assertMobileDeploymentBudget({balanceWei:"2000000000000000000",estimatedCostWei:"1000000000000000001"}), /at most 1.0 tBNB/);
  });
  it("enforces the 1.0 tBNB cap across cumulative deployment spend", () => {
    const result=assertMobileCumulativeBudget({startBalanceWei:"1300000000000000000",currentBalanceWei:"900000000000000000",estimatedCostWei:"100000000000000000"});
    assert.equal(result.spentWei,400000000000000000n);
    assert.equal(result.projectedSpendWei,500000000000000000n);
    assert.equal(result.projectedBalanceWei,800000000000000000n);
    assert.throws(()=>assertMobileCumulativeBudget({startBalanceWei:"2000000000000000000",currentBalanceWei:"1100000000000000000",estimatedCostWei:"100000000000000001"}),/cumulative.*1.0 tBNB/);
    assert.throws(()=>assertMobileCumulativeBudget({startBalanceWei:"1300000000000000000",currentBalanceWei:"1400000000000000000",estimatedCostWei:"1"}),/Invalid cumulative/);
  });
  it("connects only through an injected wallet provider", async () => {
    const provider={request:async({method})=>method==="eth_chainId"?"0x61":[MOBILE_FUTURES_DEPLOYMENT.deployer]};
    assert.equal((await connectApprovedMobileWallet(provider)).chainId,97);
  });
  it("does not send until an explicit prepared transaction is requested", async () => {
    let calls=0;
    const provider={request:async({method})=>{calls++; assert.equal(method,"eth_sendTransaction"); return "0xtest";}};
    await assert.rejects(()=>requestExplicitTransaction(provider,{from:MOBILE_FUTURES_DEPLOYMENT.deployer},MOBILE_FUTURES_DEPLOYMENT.deployer),/data/);
    assert.equal(calls,0);
    const hash=await requestExplicitTransaction(provider,{from:MOBILE_FUTURES_DEPLOYMENT.deployer,data:"0x1234"},MOBILE_FUTURES_DEPLOYMENT.deployer);
    assert.equal(hash,"0xtest"); assert.equal(calls,1);
  });
});
