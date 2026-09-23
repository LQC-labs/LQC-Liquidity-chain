# Master 7/7 — Current-release BSC Testnet Futures E2E Gate

Status: **IMPLEMENTATION BASELINE — NO TRANSACTIONS AUTHORIZED**

## Purpose

Prove that the current-release Futures artifacts can be validated against BSC Testnet chain 97 without treating historical deployments as proof of current-main bytecode identity.

## Required evidence order

1. Pin the exact current-main commit and compiled artifact hashes.
2. Run locked dependency install, compile, and broad Futures regression.
3. Run the existing chain-97 read-only wiring verifier against the recorded Registry/Vault/Engine deployment.
4. Record owner/pending-owner, Vault.engine, Engine.registry and Engine.vault.
5. Classify the recorded deployment as historical wiring evidence only until current-release artifact/runtime lineage is proven.
6. Qualify the production-equivalent Oracle path:
   - LQCAggregatorOracleAdapter primary feed;
   - independent LQCV3TwapReferenceAdapter;
   - bounded heartbeat/deviation configuration;
   - fail-closed stale/invalid/deviation behavior.
7. Qualify 7/6 Risk/Governance/Emergency boundaries:
   - Guardian can only tighten restrictions;
   - recovery to ACTIVE remains Governance-controlled;
   - residual bad debt can force REDUCE_ONLY;
   - unhealthy Oracle/circuit-breaker state can force HALTED;
   - position/order/open-interest limits remain bounded.
8. Only after repository + read-only evidence passes may a clean current-release Testnet deployment be proposed separately.

## Explicit blockers

- `preflight-futures-testnet-deploy.mjs` currently predicts a deployment using `MockLQCFuturesOracle`. It is a historical deployment-cost/readiness helper and MUST NOT be used as the 7/7 production-equivalent Oracle deployment path.
- Existing BSC Testnet runtime bytecode presence and wiring do not prove identity with current-main artifacts.
- Repository PASS does not imply Testnet VERIFIED.
- No market activation, governance mutation, wallet signature, deployment transaction, or token movement is authorized by this gate.

## Reuse

Reuse unchanged:
- `dex/scripts/verify-futures-bsc-testnet.js` for read-only historical wiring evidence;
- `dex/test/futures*.test.mjs` for broad Futures regression;
- Master 7/5 and 7/6 merged tests as dependency evidence.

Do not revive historical Futures branches wholesale.

## Exit condition

7/7 may be credited PASS only when current-release artifact lineage, production-equivalent Oracle qualification, Risk/Governance/Emergency regression, broad Futures regression, and chain-97 E2E evidence are all pinned to reproducible evidence. Any transaction-requiring step must be separately authorized and recorded.
