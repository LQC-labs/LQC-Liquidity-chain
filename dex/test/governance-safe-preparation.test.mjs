import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import {
  BSC_TESTNET_CHAIN_ID,
  GOVERNANCE_OWNERS,
  GOVERNANCE_THRESHOLD,
  SAFE_PROXY_FACTORY,
  SAFE_SINGLETON,
  buildGovernanceSafeTransaction,
} from "../scripts/prepare-governance-safe.mjs";

describe("Governance Safe deployment preparation", function () {
  it("builds an unsigned chain-97 4-of-7 Safe creation transaction", function () {
    const bundle = buildGovernanceSafeTransaction();
    assert.equal(bundle.network.chainId, BSC_TESTNET_CHAIN_ID);
    assert.equal(bundle.policy.owners.length, 7);
    assert.equal(bundle.policy.threshold, GOVERNANCE_THRESHOLD);
    assert.equal(bundle.transaction.to, SAFE_PROXY_FACTORY);
    assert.equal(bundle.transaction.value, "0");

    const factory = new ethers.Interface([
      "function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce)",
    ]);
    const decoded = factory.decodeFunctionData("createProxyWithNonce", bundle.transaction.data);
    assert.equal(decoded._singleton, SAFE_SINGLETON);

    const safe = new ethers.Interface([
      "function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
    ]);
    const setup = safe.decodeFunctionData("setup", decoded.initializer);
    assert.deepEqual([...setup._owners], GOVERNANCE_OWNERS);
    assert.equal(Number(setup._threshold), 4);
    assert.equal(setup.to, ethers.ZeroAddress);
    assert.equal(setup.payment, 0n);
  });

  it("rejects duplicate owners and policy weakening", function () {
    assert.throws(
      () => buildGovernanceSafeTransaction({ owners: [...GOVERNANCE_OWNERS.slice(0, 6), GOVERNANCE_OWNERS[0]] }),
      /unique/,
    );
    assert.throws(() => buildGovernanceSafeTransaction({ threshold: 3 }), /4-of-7/);
  });

  it("keeps the TokenPocket page transaction identical to the reviewed generator", function () {
    const source = fs.readFileSync(new URL("../app/governance-safe-testnet.js", import.meta.url), "utf8");
    const data = source.match(/const DATA = "(0x[0-9a-f]+)";/)?.[1];
    assert.equal(data, buildGovernanceSafeTransaction().transaction.data);
    for (const owner of GOVERNANCE_OWNERS) assert.match(source, new RegExp(owner, "i"));
  });
});
