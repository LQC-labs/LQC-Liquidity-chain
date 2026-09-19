import assert from "node:assert/strict";
import { ethers } from "ethers";
import { validateFuturesPreflightConfig, assertFuturesBudget } from "../scripts/preflight-futures-testnet-deploy.mjs";

const deployer="0x1111111111111111111111111111111111111111";
const owner="0x2222222222222222222222222222222222222222";
const base={BSC_TESTNET_RPC_URL:"https://example.invalid",FUTURES_DEPLOYER_ADDRESS:deployer,FUTURES_OWNER_ADDRESS:owner};

describe("Futures BSC testnet deployment preflight",function(){
  it("accepts separated roles with the protected 0.3 tBNB reserve",function(){
    const c=validateFuturesPreflightConfig(base);
    assert.equal(c.deployer,ethers.getAddress(deployer));
    assert.equal(c.reserve,ethers.parseEther("0.3"));
    assert.equal(c.maxSpend,ethers.parseEther("1.0"));
  });
  it("rejects missing RPC and invalid role addresses",function(){
    assert.throws(()=>validateFuturesPreflightConfig({...base,BSC_TESTNET_RPC_URL:""}),/RPC/);
    assert.throws(()=>validateFuturesPreflightConfig({...base,FUTURES_OWNER_ADDRESS:"bad"}),/governance/);
  });
  it("rejects deployer-owner role collapse unless explicitly approved for testnet bootstrap",function(){
    assert.throws(()=>validateFuturesPreflightConfig({...base,FUTURES_OWNER_ADDRESS:deployer}),/separated/);
    assert.doesNotThrow(()=>validateFuturesPreflightConfig({...base,FUTURES_OWNER_ADDRESS:deployer,ALLOW_FUTURES_DEPLOYER_AS_OWNER:"true"}));
  });
  it("never permits a reserve below 0.3 tBNB or a spend cap above 1.0 tBNB",function(){
    assert.throws(()=>validateFuturesPreflightConfig({...base,FUTURES_MIN_TBNB_RESERVE:"0.299"}),/below/);
    assert.throws(()=>validateFuturesPreflightConfig({...base,FUTURES_MAX_DEPLOYMENT_SPEND:"1.01"}),/at most/);
  });
  it("rejects an estimated deployment that breaks either budget boundary",function(){
    const c=validateFuturesPreflightConfig(base);
    assert.throws(()=>assertFuturesBudget(ethers.parseEther("1.3"),ethers.parseEther("1.01"),c),/spend cap/);
    assert.throws(()=>assertFuturesBudget(ethers.parseEther("1.2"),ethers.parseEther("1.0"),c),/reserve/);
    assert.equal(assertFuturesBudget(ethers.parseEther("1.3"),ethers.parseEther("0.9"),c),ethers.parseEther("0.4"));
  });
  it("rejects a runtime key that does not match the declared deployer without exposing it",function(){
    const key="0x"+"01".repeat(32);
    assert.throws(()=>validateFuturesPreflightConfig({...base,DEPLOYER_PRIVATE_KEY:key}),/does not match/);
  });
});
