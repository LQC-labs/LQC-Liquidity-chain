import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { SAFE_PROXY_FACTORY, SAFE_SINGLETON } from "../scripts/prepare-governance-safe.mjs";
import {
  OPERATIONAL_OWNERS,
  OPERATIONAL_THRESHOLD,
  buildOperationalSafeTransaction,
} from "../scripts/prepare-operational-safe.mjs";

describe("Operational Safe deployment preparation", function () {
  for (const [role, constant, page] of [
    ["guardian", "EMERGENCY_GUARDIAN_DATA", "emergency-guardian-safe-testnet.html"],
    ["treasury", "TREASURY_DATA", "treasury-safe-testnet.html"],
  ]) {
    it(`builds a distinct reviewed 3-of-5 ${role} Safe transaction`, function () {
      const bundle = buildOperationalSafeTransaction(role);
      assert.equal(bundle.network.chainId, 97);
      assert.equal(bundle.policy.owners.length, 5);
      assert.equal(bundle.policy.threshold, OPERATIONAL_THRESHOLD);
      assert.equal(bundle.transaction.to, SAFE_PROXY_FACTORY);

      const factory = new ethers.Interface(["function createProxyWithNonce(address,bytes,uint256)"]);
      const decoded = factory.decodeFunctionData("createProxyWithNonce", bundle.transaction.data);
      assert.equal(decoded[0], SAFE_SINGLETON);
      const safe = new ethers.Interface(["function setup(address[],uint256,address,bytes,address,address,uint256,address)"]);
      const setup = safe.decodeFunctionData("setup", decoded[1]);
      assert.deepEqual([...setup[0]], OPERATIONAL_OWNERS);
      assert.equal(Number(setup[1]), 3);

      const source = fs.readFileSync(new URL("../app/governance-safe-testnet.js", import.meta.url), "utf8");
      const data = source.match(new RegExp(`const ${constant} = "(0x[0-9a-f]+)";`))?.[1];
      assert.equal(data, bundle.transaction.data);
      assert.match(source, new RegExp(`"${page.replaceAll(".", "\\.")}"`));
      assert.match(fs.readFileSync(new URL(`../app/${page}`, import.meta.url), "utf8"), /서명자 5명 · 승인 기준 3명/);
    });
  }

  it("uses independent deterministic salts for every operational role", function () {
    const guardian = buildOperationalSafeTransaction("guardian");
    const treasury = buildOperationalSafeTransaction("treasury");
    assert.notEqual(guardian.saltNonce, treasury.saltNonce);
    assert.notEqual(guardian.transaction.data, treasury.transaction.data);
    assert.throws(() => buildOperationalSafeTransaction("risk"), /guardian or treasury/);
  });

  it("turns a duplicate CREATE2 failure into a stop-and-recover instruction", function () {
    const source = fs.readFileSync(new URL("../app/governance-safe-testnet.js", import.meta.url), "utf8");
    assert.match(source, /Safe가 이미 생성된 것으로 보입니다/);
    assert.match(source, /다시 누르지 말고 기존 Safe 주소와 거래 해시를 확인하세요/);
  });
});
