import assert from "node:assert/strict";
import { buildAppConfig, assertOverridesMatchDeployment } from "../scripts/app-config.mjs";

const address = number => `0x${number.toString(16).padStart(40, "0")}`;
const id = `0x${"11".repeat(32)}`;
const deployment = { network: { chainId: 97 }, contracts: {
  router: { address: address(1) }, quoteRouter: { address: address(2) }, executionRouter: { address: address(3) },
  nativeRouter: { address: address(4) }, splitOptimizer: { address: address(5) }, autoRouter: { address: address(6) },
  gasCostOracle: { address: address(7) }, wbnb: { address: address(8) }, lqc: { address: address(9), decimals: 18 },
  mockUsdt: { address: address(10), decimals: 18 }
}, dexes: [{ id, adapter: address(11), name: "LQC Flow", kind: "v2" }] };

describe("LQC DEX app deployment configuration", function () {
  it("derives every UI address and a deterministic fingerprint from one deployment record", function () {
    const first = buildAppConfig(deployment), second = buildAppConfig(deployment);
    assert.equal(first.deploymentFingerprint, second.deploymentFingerprint);
    assert.equal(first.tokens.find(token => token.symbol === "LQC").address, address(9));
    assert.equal(first.dexes[0].adapter, address(11));
    assert.equal(first.candleDataUrl, "");
  });
  it("accepts only a secure configured candle indexer", function () {
    const config=buildAppConfig({ ...deployment, ui: { candleDataUrl: "https://indexer.lqc.example/candles",candleSignerAddress:address(20) } });assert.equal(config.candleDataUrl, "https://indexer.lqc.example/candles");assert.equal(config.candleSignerAddress,address(20));
    assert.throws(() => buildAppConfig({ ...deployment, ui: { candleDataUrl: "http://indexer.lqc.example/candles",candleSignerAddress:address(20) } }), /must use HTTPS/);
    assert.throws(() => buildAppConfig({ ...deployment, ui: { candleDataUrl: "https://indexer.lqc.example/candles" } }), /candleSignerAddress/);
    assert.throws(() => buildAppConfig({ ...deployment, ui: { candleSignerAddress:address(20) } }), /requires candleDataUrl/);
  });
  it("rejects wrong chains, missing contracts, and duplicate DEX ids", function () {
    assert.throws(() => buildAppConfig({ ...deployment, network: { chainId: 56 } }), /chain 97/);
    assert.throws(() => buildAppConfig({ ...deployment, contracts: { ...deployment.contracts, autoRouter: null } }), /autoRouter/);
    assert.throws(() => buildAppConfig({ ...deployment, dexes: [deployment.dexes[0], deployment.dexes[0]] }), /duplicates/);
  });
  it("rejects every manual address override that differs from the deployment record", function () {
    const config = buildAppConfig(deployment);
    assert.doesNotThrow(() => assertOverridesMatchDeployment(config, { ROUTER_ADDRESS: address(1) }));
    assert.throws(() => assertOverridesMatchDeployment(config, { ROUTER_ADDRESS: address(12) }), /does not match/);
  });
  it("adds only validated risk-approved tokens to the searchable UI list", function () {
    const withTokens = { ...deployment, reviewedTokens: [
      { symbol: "CAKE", name: "PancakeSwap Token", address: address(12), decimals: 18, riskApproved: true, routeDexIds: [id] },
      { symbol: "USDC", name: "USD Coin", address: address(13), decimals: 6, riskApproved: true, routeDexIds: [id] }
    ], reviewedPairs: [
      { tokenA: address(12), tokenB: address(9), dexIds: [id] },
      { tokenA: address(13), tokenB: address(9), dexIds: [id] }
    ] };
    const config = buildAppConfig(withTokens);
    assert.deepEqual(config.tokens.slice(-2).map(token => [token.symbol, token.decimals, token.reviewed, token.routeDexIds]), [
      ["CAKE", 18, true, [id]], ["USDC", 6, true, [id]]
    ]);
    assert.notEqual(buildAppConfig({ ...withTokens, reviewedTokens: withTokens.reviewedTokens.slice(0, 1), reviewedPairs: withTokens.reviewedPairs.slice(0, 1) }).deploymentFingerprint,
      config.deploymentFingerprint);
    assert.notEqual(buildAppConfig({ ...withTokens, reviewedTokens: [{ ...withTokens.reviewedTokens[0], name: "CAKE Token" }, withTokens.reviewedTokens[1]] }).deploymentFingerprint,
      config.deploymentFingerprint);
  });
  it("rejects unapproved, malformed, or duplicate reviewed tokens", function () {
    const reviewed = token => ({ ...deployment, reviewedTokens: [token] });
    const valid = { symbol: "CAKE", name: "Cake", address: address(12), decimals: 18, riskApproved: true, routeDexIds: [id] };
    assert.throws(() => buildAppConfig(reviewed({ ...valid, riskApproved: false })), /not risk-approved/);
    assert.throws(() => buildAppConfig(reviewed({ ...valid, symbol: "BAD TOKEN" })), /invalid symbol/);
    assert.throws(() => buildAppConfig(reviewed({ ...valid, decimals: 37 })), /invalid decimals/);
    assert.throws(() => buildAppConfig(reviewed({ ...valid, routeDexIds: [] })), /no approved DEX routes/);
    assert.throws(() => buildAppConfig(reviewed({ ...valid, routeDexIds: [`0x${"22".repeat(32)}`] })), /invalid or duplicate DEX route/);
    assert.throws(() => buildAppConfig(reviewed({ ...valid, symbol: "LQC" })), /duplicates a symbol/);
    assert.throws(() => buildAppConfig(reviewed({ ...valid, address: address(9) })), /duplicates an address/);
  });
  it("requires exact reviewed token pairs bounded by token and DEX approvals", function () {
    const token = { symbol: "CAKE", name: "Cake", address: address(12), decimals: 18, riskApproved: true, routeDexIds: [id] };
    const make = reviewedPairs => ({ ...deployment, reviewedTokens: [token], reviewedPairs });
    assert.doesNotThrow(() => buildAppConfig(make([{ tokenA: address(12), tokenB: address(9), dexIds: [id] }])));
    assert.throws(() => buildAppConfig(make([])), /no approved token pair/);
    assert.throws(() => buildAppConfig(make([{ tokenA: address(12), tokenB: address(14), dexIds: [id] }])), /unknown or identical tokens/);
    assert.throws(() => buildAppConfig(make([{ tokenA: address(12), tokenB: address(9), dexIds: [`0x${"22".repeat(32)}`] }])), /invalid or duplicate DEX route/);
    assert.throws(() => buildAppConfig(make([
      { tokenA: address(12), tokenB: address(9), dexIds: [id] },
      { tokenA: address(9), tokenB: address(12), dexIds: [id] }
    ])), /duplicates a token pair/);
  });
});
