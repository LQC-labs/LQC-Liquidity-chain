import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(import.meta.dirname, "../app/app.js"), "utf8");

describe("LQC DEX pre-trade balance consensus", function () {
  it("reads native and token balances only through trusted RPC sources", function () {
    assert.match(app, /trustedReadProviderIndexes\.map\(async index=>/);
    assert.match(app, /asset\.address==='native'\?await readProviders\[index\]\.getBalance\(boundOwner\)/);
    assert.match(app, /new ethers\.Contract\(asset\.address,tokenAbi,readProviders\[index\]\)\.balanceOf\(boundOwner\)/);
    assert.match(app, /chartHealth\.consensusAssetBalance\(observations,readProviders\.length\)/);
  });

  it("fails closed before approval or swap preparation when funds are insufficient", function () {
    const balanceCheck = app.indexOf("availableBalance=await readAssetBalance(tokenIn,walletContext.account)");
    const approval = app.indexOf("sdk.requiresTokenApproval", balanceCheck);
    const preparation = app.indexOf("prepareSwapTransaction", balanceCheck);
    assert.ok(balanceCheck >= 0 && approval > balanceCheck && preparation > balanceCheck);
    assert.match(app, /if\(availableBalance<value\)throw new Error\('InsufficientTradeBalance'\)/);
  });

  it("requires enough BNB for the maximum transaction fee immediately before signing", function () {
    assert.match(app, /maximumFee=prepared\.request\.gasLimit\*\(prepared\.request\.type===2\?prepared\.request\.maxFeePerGas:prepared\.request\.gasPrice\)/);
    assert.match(app, /nativeBalance<prepared\.request\.value\+maximumFee/);
    assert.match(app, /nativeBalance<maximumFee\)throw new Error\('InsufficientGasBalance'\)/);
  });
});
