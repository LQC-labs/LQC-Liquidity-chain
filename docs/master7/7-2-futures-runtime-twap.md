# Master 7/2 — Futures Independent Runtime Reference Oracle

Status: **repository implementation gate**

## Purpose

Fill the real Oracle gap identified by Master 7/1 without merging historical PR #296 wholesale.

Current main already contains:

- V3 TWAP qualification/preflight tooling;
- integer TWAP price-conversion tooling;
- the primary AggregatorV3 adapter;
- on-chain primary/reference deviation enforcement;
- a test-only V3 TWAP pool.

The missing component was a runtime, read-only, Chainlink-compatible reference source that can feed the current Futures circuit breaker.

## Selective reuse decision

Historical PR #296 was 53 commits behind current main and its old CI was not green. Its useful design idea is retained, but the runtime adapter is rebuilt and revalidated on current main.

The implementation preserves the useful boundaries from #296:

- V3 pool pair binding;
- minimum observation window;
- minimum liquidity;
- observation-cardinality and unlocked-state checks;
- arithmetic-mean TWAP tick with correct negative-floor behavior;
- read-only `AggregatorV3` interface;
- no market activation or custody methods.

The price conversion is implemented with full-precision `mulDiv` and is cross-checked against the existing JavaScript integer TWAP conversion gate in both pair directions.

## Integration

`LQCV3TwapReferenceAdapter` can be configured as the independent `referenceFeed` of the existing `LQCAggregatorOracleAdapter`.

Therefore the current Futures Oracle path becomes:

**Primary AggregatorV3 feed → LQCAggregatorOracleAdapter ← independent V3 TWAP reference**

The existing Oracle adapter remains responsible for:

- primary-feed heartbeat/round validation;
- reference-feed read validation;
- maximum primary/reference deviation;
- fail-closed price output.

The runtime TWAP adapter does not activate markets and cannot modify Futures positions, Vault custody or risk parameters.

## Evidence boundary

Passing 7/2 means:

**INDEPENDENT RUNTIME V3 TWAP REFERENCE IMPLEMENTED + CURRENT-MAIN TESTED**

It does not mean:

- a specific production V3 pool has been approved;
- the reference adapter has been deployed to BSC Testnet;
- current deployed Futures Oracle has been reconfigured;
- production Oracle policy is complete;
- market activation is authorized.

`activationAuthorized: false`

## Next

**7/3 Current Artifact / BSC Testnet Deployment Lineage Reconciliation**

Use read-only evidence first. Do not redeploy or reconfigure the existing Futures stack merely to make historical evidence look current.
