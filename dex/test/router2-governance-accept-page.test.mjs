import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "mocha";

const html = fs.readFileSync(new URL("../app/router2-governance-accept-testnet.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../app/router2-governance-accept-testnet.js", import.meta.url), "utf8");

describe("Router 2.0 Governance ownership acceptance handoff", function () {
  it("pins the recorded chain, Safe, Risk Registry and acceptOwnership selector", function () {
    assert.match(script, /CHAIN_ID = "0x61"/);
    assert.match(script, /0xe10a1d467a553900cb4d1755e079b35b0cd0c48b/i);
    assert.match(script, /0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A/i);
    assert.match(script, /ACCEPT_OWNERSHIP = "0x79ba5097"/);
  });

  it("performs read-only ownership checks and never sends a transaction", function () {
    assert.match(script, /eth_call/);
    assert.match(script, /eth_getCode/);
    assert.doesNotMatch(script, /eth_sendTransaction/);
    assert.match(script, /pending !== GOVERNANCE\.toLowerCase\(\)/);
  });

  it("requires the 4-of-7 Safe workflow and blocks duplicate acceptance", function () {
    assert.match(html, /4\/7/);
    assert.match(html, /개인지갑에서 직접 보내면 실패/);
    assert.match(script, /이미 Risk Registry 소유자입니다/);
    assert.match(script, /safe=bnbt:/);
  });
});
