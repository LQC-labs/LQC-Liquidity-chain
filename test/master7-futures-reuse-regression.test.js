import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const required=[
  "dex/contracts/futures/LQCFuturesMarketRegistry.sol",
  "dex/contracts/futures/LQCFuturesVault.sol",
  "dex/contracts/futures/LQCAggregatorOracleAdapter.sol",
  "dex/contracts/futures/LQCPerpEngine.sol",
  "dex/test/futures-testnet-e2e.test.mjs",
  "dex/test/futures-security-gate.test.mjs",
  "dex/test/futures-oracle-adapter.test.mjs",
  "dex/test/futures-funding-engine.test.mjs",
  "dex/test/futures-shared-insurance-flow.test.mjs",
  "docs/futures/BSC_TESTNET_TX_EVIDENCE.md",
  "dex/deployments/bsc-testnet/futures-2026-09-19.md"
];

test("Master 7/1 reuses the current Futures implementation and evidence surface",()=>{
  for(const file of required) assert.ok(fs.existsSync(file),file);
});

test("Master 7/1 preserves Futures and Lending as separate accounting domains",()=>{
  for(const file of [
    "dex/contracts/futures/LQCFuturesMarketRegistry.sol",
    "dex/contracts/futures/LQCFuturesVault.sol",
    "dex/contracts/futures/LQCAggregatorOracleAdapter.sol",
    "dex/contracts/futures/LQCPerpEngine.sol"
  ]){
    const source=fs.readFileSync(file,"utf8");
    assert.ok(!/LQCLending|contracts\/lending|lending\//i.test(source),file);
  }
});

test("Master 7/1 reuse boundary remains explicit as later Futures stages extend the Perp engine",()=>{
  const engine=fs.readFileSync("dex/contracts/futures/LQCPerpEngine.sol","utf8");
  for(const fn of["openPosition","closePosition","liquidate","getPositionPnl"]){
    assert.ok(engine.includes(`function ${fn}`),fn);
  }
  assert.ok(!engine.includes("LQCLendingCore"));
  assert.ok(engine.includes("PositionPartiallyLiquidated"));
  assert.ok(!engine.includes("function autoDeleverage"));
});

test("Master 7/1 preserves exact BSC Testnet deployment evidence without inferring missing hashes",()=>{
  const deployment=fs.readFileSync("dex/deployments/bsc-testnet/futures-2026-09-19.md","utf8");
  assert.ok(deployment.includes("Chain: BSC Testnet (chainId 97)"));
  for(const address of[
    "0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
    "0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
    "0xbf6a446c5e17228e70e45645ab47f751bdfc4b41",
    "0xe4f1320c8709631776c7e39e0916584935882525"
  ]) assert.ok(deployment.toLowerCase().includes(address),address);
  assert.ok(deployment.includes("transaction hash is intentionally not recorded"));
});

test("Master 7/1 keeps production activation outside current evidence credit",()=>{
  const gate=fs.readFileSync("dex/scripts/gate-futures-production-oracle.mjs","utf8");
  const evidence=fs.readFileSync("docs/futures/BSC_TESTNET_TX_EVIDENCE.md","utf8");
  assert.ok(gate.includes("no production Futures deployment/config manifest exists"));
  assert.ok(gate.includes("Production deployment is blocked"));
  assert.ok(evidence.includes("does not by itself assert transaction success"));
});
