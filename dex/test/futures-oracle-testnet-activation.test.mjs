import assert from "node:assert/strict";
import fs from "node:fs";
import anvil from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
import { preflightFuturesOracleTestnet, validateOracleActivationConfig } from "../scripts/preflight-futures-oracle-testnet.mjs";
import { buildOracleGovernanceActions, prepareOracleActivation } from "../scripts/prepare-futures-oracle-testnet-activation.mjs";

const artifact = (name, source) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);
async function deploy(signer, name, source, args = []) {
  const a = artifact(name, source);
  const contract = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

describe("Futures production-oracle BSC testnet activation", function () {
  let provider, owner, token, primary, reference, adapter, env;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(anvil.provider({ chain: { chainId: 97 } }));
    owner = await provider.getSigner(0);
    token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Mock BTC", "mBTC"]);
    primary = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    reference = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    adapter = await deploy(owner, "LQCAggregatorOracleAdapter", "futures/LQCAggregatorOracleAdapter", [await owner.getAddress()]);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await primary.setRoundData(10, 50_000n * 10n ** 8n, now, 10)).wait();
    await (await reference.setRoundData(10, 49_900n * 10n ** 8n, now, 10)).wait();
    env = {
      FUTURES_ORACLE_OWNER: await owner.getAddress(),
      FUTURES_ORACLE_INDEX_TOKEN: await token.getAddress(),
      FUTURES_ORACLE_PRIMARY_FEED: await primary.getAddress(),
      FUTURES_ORACLE_REFERENCE_FEED: await reference.getAddress(),
      FUTURES_ORACLE_HEARTBEAT: "300",
      FUTURES_ORACLE_MAX_DEVIATION_BPS: "200",
      FUTURES_ORACLE_ADAPTER: await adapter.getAddress(),
    };
  });

  it("passes a read-only chain-97 dual-feed preflight", async function () {
    const result = await preflightFuturesOracleTestnet(env, provider);
    assert.equal(result.status, "READ_ONLY_PREFLIGHT_PASS");
    assert.equal(result.chainId, 97);
    assert.equal(result.feeds.primary.decimals, 8);
    assert.equal(result.feeds.reference.decimals, 8);
  });

  it("builds ordered owner-only calldata without sending a transaction", async function () {
    const result = await prepareOracleActivation(env, provider);
    assert.equal(result.status, "AWAITING_GOVERNANCE_SIGNATURES");
    assert.equal(result.readOnly, true);
    assert.equal(result.actions.length, 2);
    const iface = new ethers.Interface([
      "function setFeed(address,address,uint32)",
      "function setCircuitBreaker(address,address,uint16)",
    ]);
    assert.equal(iface.parseTransaction({ data: result.actions[0].data }).name, "setFeed");
    assert.equal(iface.parseTransaction({ data: result.actions[1].data }).name, "setCircuitBreaker");
  });

  it("fails closed on wrong chain, stale feed, missing bytecode, and malformed bounds", async function () {
    const wrongProvider = new ethers.BrowserProvider(anvil.provider({ chain: { chainId: 56 } }));
    await assert.rejects(preflightFuturesOracleTestnet(env, wrongProvider), /chainId 97/);

    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await primary.setRoundData(11, 50_000n * 10n ** 8n, now - 301n, 11)).wait();
    await assert.rejects(preflightFuturesOracleTestnet(env, provider), /stale/);

    await assert.rejects(prepareOracleActivation({ ...env, FUTURES_ORACLE_ADAPTER: await token.getAddress() }, {
      ...provider,
      getNetwork: provider.getNetwork.bind(provider),
      getBlock: provider.getBlock.bind(provider),
      getCode: async (address) => address === await token.getAddress() ? "0x" : provider.getCode(address),
    }), /no runtime bytecode/);

    assert.throws(() => validateOracleActivationConfig({ ...env, FUTURES_ORACLE_HEARTBEAT: "0" }), /Heartbeat/);
    assert.throws(() => validateOracleActivationConfig({ ...env, FUTURES_ORACLE_MAX_DEVIATION_BPS: "5001" }), /deviation/);
    assert.throws(() => validateOracleActivationConfig({ ...env, FUTURES_ORACLE_REFERENCE_FEED: env.FUTURES_ORACLE_PRIMARY_FEED }), /distinct/);
  });

  it("encodes the exact reviewed adapter and bounded configuration", function () {
    const config = validateOracleActivationConfig(env);
    const actions = buildOracleGovernanceActions(env.FUTURES_ORACLE_ADAPTER, config);
    assert.equal(actions[0].to, ethers.getAddress(env.FUTURES_ORACLE_ADAPTER));
    assert.equal(actions[0].value, "0");
    assert.equal(actions[1].value, "0");
  });
});
