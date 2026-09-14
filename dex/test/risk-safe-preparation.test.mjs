import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { SAFE_PROXY_FACTORY, SAFE_SINGLETON } from "../scripts/prepare-governance-safe.mjs";
import { RISK_OWNERS, RISK_THRESHOLD, buildRiskSafeTransaction } from "../scripts/prepare-risk-safe.mjs";

describe("Risk Safe deployment preparation", function () {
  it("builds an unsigned chain-97 3-of-5 Safe creation transaction", function () {
    const bundle = buildRiskSafeTransaction();
    assert.equal(bundle.network.chainId, 97);
    assert.equal(bundle.policy.owners.length, 5);
    assert.equal(bundle.policy.threshold, RISK_THRESHOLD);
    assert.equal(bundle.transaction.to, SAFE_PROXY_FACTORY);
    const factory = new ethers.Interface(["function createProxyWithNonce(address,bytes,uint256)"]);
    const decoded = factory.decodeFunctionData("createProxyWithNonce", bundle.transaction.data);
    assert.equal(decoded[0], SAFE_SINGLETON);
    const safe = new ethers.Interface(["function setup(address[],uint256,address,bytes,address,address,uint256,address)"]);
    const setup = safe.decodeFunctionData("setup", decoded[1]);
    assert.deepEqual([...setup[0]], RISK_OWNERS);
    assert.equal(Number(setup[1]), 3);
  });

  it("keeps the TokenPocket Risk page transaction identical to the generator", function () {
    const source = fs.readFileSync(new URL("../app/governance-safe-testnet.js", import.meta.url), "utf8");
    const data = source.match(/const RISK_DATA = "(0x[0-9a-f]+)";/)?.[1];
    assert.equal(data, buildRiskSafeTransaction().transaction.data);
    assert.match(source, /IS_RISK \? "5개 주소와 3\/5" : "7개 주소와 4\/7"/);
  });
});
