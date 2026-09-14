import assert from "node:assert/strict";
import { buildMinimalRouterReport, createReadProvider, minimalMonitorConfigFromDeployment,
  parseRpcUrls, selectHealthyRpc } from "../scripts/monitor-minimal-router.mjs";

const address = value => `0x${value.toString(16).padStart(40, "0")}`;
const healthy = () => ({ checkedAt: "2026-09-14T07:10:00.000Z", blockNumber: 130938158,
  router: address(1), expectedFactory: address(2), expectedWbnb: address(3),
  observedFactory: address(2), observedWbnb: address(3), balances: [
    { asset: "BNB", balance: "0" }, { asset: "tLQC", balance: "0" }, { asset: "WBNB", balance: "0" }
  ] });

describe("LQC minimal testnet Router monitoring", function () {
  it("accepts bounded unique HTTPS RPC failover lists", function () {
    assert.deepEqual(parseRpcUrls("https://one.example, https://two.example"),
      ["https://one.example", "https://two.example"]);
    assert.ok(createReadProvider("https://one.example", 1000));
    assert.throws(() => parseRpcUrls("http://one.example"), /HTTPS/);
    assert.throws(() => parseRpcUrls("https://one.example,https://one.example"), /unique/);
    assert.throws(() => createReadProvider("https://one.example", 999), /1-30 seconds/);
  });
  it("records sanitized failures and selects the first healthy chain-97 RPC", async function () {
    const providers = new Map([
      ["https://failed.example/private/key", { getNetwork: async () => { const error = new Error("secret upstream detail"); error.code = "TIMEOUT"; throw error; }, getBlockNumber: async () => 1 }],
      ["https://healthy.example/api?key=secret", { getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 130938158 }]
    ]);
    const result = await selectHealthyRpc([...providers.keys()].join(","), 1000, url => providers.get(url));
    assert.equal(result.selectedEndpoint, "https://healthy.example");
    assert.deepEqual(result.diagnostics, [
      { endpoint: "https://failed.example", status: "FAILED", code: "TIMEOUT" },
      { endpoint: "https://healthy.example", status: "SELECTED", chainId: 97, blockNumber: 130938158 }
    ]);
    assert.equal(JSON.stringify(result.diagnostics).includes("secret"), false);
  });
  it("fails with bounded diagnostics when every RPC is unavailable", async function () {
    const provider = { getNetwork: async () => ({ chainId: 56n }), getBlockNumber: async () => 1 };
    await assert.rejects(() => selectHealthyRpc("https://wrong.example", 1000, () => provider), error => {
      assert.equal(error.message, "No healthy BSC Testnet RPC endpoint is available.");
      assert.deepEqual(error.diagnostics, [{ endpoint: "https://wrong.example", status: "FAILED", code: "WRONG_CHAIN" }]);
      return true;
    });
  });
  it("loads every address from the chain-97 minimal deployment record", function () {
    const deployment = { mode: "minimal-testnet-smoke", network: { chainId: 97 }, contracts: {
      router: address(1), factory: address(2), tLQC: address(3), wbnb: address(4) } };
    assert.deepEqual(minimalMonitorConfigFromDeployment(deployment), {
      router: address(1), factory: address(2), tlqc: address(3), wbnb: address(4) });
    assert.throws(() => minimalMonitorConfigFromDeployment({ ...deployment, network: { chainId: 56 } }), /chain 97/);
    delete deployment.contracts.factory;
    assert.throws(() => minimalMonitorConfigFromDeployment(deployment), /missing factory/);
  });
  it("reports healthy only when bindings match and no swap funds remain", function () {
    const report = buildMinimalRouterReport(healthy());
    assert.equal(report.status, "HEALTHY");
    assert.deepEqual(report.counts, { pass: 5, critical: 0 });
  });

  it("fails closed when a Router binding changes", function () {
    const input = healthy(); input.observedFactory = address(9);
    const report = buildMinimalRouterReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.checks.find(check => check.id === "binding.factory").status, "CRITICAL");
  });

  it("fails closed when native or token funds remain in the Router", function () {
    const input = healthy(); input.balances[0].balance = "1"; input.balances[1].balance = "10";
    const report = buildMinimalRouterReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.counts.critical, 2);
  });

  it("rejects incomplete, duplicate, or invalid balance evidence", function () {
    assert.throws(() => buildMinimalRouterReport({ ...healthy(), balances: [] }), /incomplete/);
    const duplicate = healthy(); duplicate.balances[2].asset = "tLQC";
    assert.throws(() => buildMinimalRouterReport(duplicate), /ambiguous/);
    const invalid = healthy(); invalid.balances[0].balance = "-1";
    assert.throws(() => buildMinimalRouterReport(invalid), /Invalid BNB balance/);
  });
});
