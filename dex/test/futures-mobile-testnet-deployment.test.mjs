import assert from "node:assert/strict";
import {
  assertMobileDeploymentContext,
  connectApprovedMobileWallet,
  requestExplicitTransaction,
  MOBILE_FUTURES_DEPLOYMENT,
} from "../app/futures/mobile-testnet-deployment.js";

describe("Futures mobile testnet wallet gate", () => {
  it("pins BSC Testnet and the approved deployer", () => {
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.chainId, 97);
    assert.equal(MOBILE_FUTURES_DEPLOYMENT.privateKeyInputSupported, false);
    assert.doesNotThrow(() => assertMobileDeploymentContext({chainId:"0x61",account:MOBILE_FUTURES_DEPLOYMENT.deployer}));
  });
  it("rejects wrong network and wrong signer", () => {
    assert.throws(() => assertMobileDeploymentContext({chainId:"0x38",account:MOBILE_FUTURES_DEPLOYMENT.deployer}), /Wrong network/);
    assert.throws(() => assertMobileDeploymentContext({chainId:"0x61",account:"0x1111111111111111111111111111111111111111"}), /Wrong signer/);
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
