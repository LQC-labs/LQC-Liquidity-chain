import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 5/7 keeps circuit breakers fail-closed and module-isolated",()=>{
  const lending=fs.readFileSync("dex/contracts/lending/LQCOracleManager.sol","utf8");
  const futures=fs.readFileSync("dex/contracts/futures/LQCAggregatorOracleAdapter.sol","utf8");
  const registry=fs.readFileSync("dex/contracts/futures/LQCFuturesMarketRegistry.sol","utf8");
  const appGuard=fs.readFileSync("dex/app/futures/oracle-guard.js","utf8");
  const boundary=fs.readFileSync("docs/ORACLE_INTERFACE_BOUNDARY.md","utf8");
  const doc=fs.readFileSync("docs/master5/5-7-circuit-breaker.md","utf8");

  assert.match(lending,/setAssetEnabled/);
  assert.match(lending,/msg\.sender != owner && msg\.sender != guardian/);
  assert.match(lending,/if \(enabled\).*msg\.sender != owner/s);
  assert.match(lending,/revert ExcessiveDeviation\(\)/);

  assert.match(futures,/setCircuitBreaker/);
  assert.match(futures,/revert ExcessivePriceDeviation\(\)/);
  assert.match(registry,/setMarketActive/);

  assert.match(appGuard,/priceCircuitBreaker/);
  assert.match(boundary,/maintain independent emergency disable\/pause domains/);
  assert.match(doc,/application-level Futures .* supplemental UI\/service protection only/s);
  assert.match(doc,/activationAuthorized: false/);
});
