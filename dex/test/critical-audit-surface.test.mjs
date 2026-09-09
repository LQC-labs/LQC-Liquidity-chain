import assert from "node:assert/strict";
import fs from "node:fs";

const audit = JSON.parse(fs.readFileSync(new URL("../audit/critical-surface.json", import.meta.url)));
const artifact = (name, source) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));
const signature = item => `${item.name}(${item.inputs.map(input => input.type).join(",")})`;

describe("LQC critical Solidity audit surface", function () {
  it("maps every state-changing entry point to authority, risk, and existing test evidence", function () {
    assert.equal(audit.status, "UNAUDITED_TESTNET_MVP");
    let mapped = 0;
    for (const [name, contract] of Object.entries(audit.contracts)) {
      const abi = artifact(name, contract.source).abi;
      const actual = abi.filter(item => item.type === "function" && !["view", "pure"].includes(item.stateMutability)).map(signature).sort();
      const declared = contract.entries.map(entry => entry.signature).sort();
      assert.deepEqual(declared, actual, `${name} audit surface drifted`);
      for (const entry of contract.entries) {
        assert.match(entry.authority, /^[a-z][a-z-]*$/);
        assert.ok(["critical", "high"].includes(entry.risk));
        assert.ok(entry.evidence.length > 0);
        for (const evidence of entry.evidence) assert.equal(fs.existsSync(new URL(`../${evidence}`, import.meta.url)), true, evidence);
        mapped++;
      }
    }
    assert.equal(mapped, 35);
  });
});
