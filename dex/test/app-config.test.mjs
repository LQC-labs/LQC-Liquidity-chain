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
const minimalDeployment = { mode: "minimal-testnet-smoke", network: { chainId: 97 }, contracts: {
  router: address(21), wbnb: address(22), tLQC: address(23)
} };

describe("LQC DEX app deployment configuration", function () {
  it("derives every UI address and a deterministic fingerprint from one deployment record", function () {
    const first = buildAppConfig(deployment), second = buildAppConfig(deployment);
    assert.equal(first.deploymentFingerprint, second.deploymentFingerprint);
    assert.equal(first.tokens.find(token => token.symbol === "LQC").address, address(9));
    assert.equal(first.dexes[0].adapter, address(11));
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
  it("builds a bounded minimal testnet config without production-only contracts", function () {
    const config = buildAppConfig(minimalDeployment);
    assert.equal(config.deploymentMode, "minimal-testnet-smoke");
    assert.equal(config.chainId, 97);
    assert.equal(config.routerAddress, address(21));
    assert.equal(config.dexes.length, 0);
    assert.equal(config.tokens.find(token => token.symbol === "LQC").address, address(23));
    assert.equal(config.quoteRouterAddress, null);
    assert.equal(config.deploymentFingerprint, buildAppConfig(minimalDeployment).deploymentFingerprint);
    assert.throws(() => buildAppConfig({ ...minimalDeployment, contracts: { ...minimalDeployment.contracts, router: null } }), /router address/);
  });
});
