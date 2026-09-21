# Master 7/1 — Futures Latest-Main Regression / Reuse Reconciliation

Status: **reuse-first baseline gate**

## Purpose

Open Master 7 without rebuilding Futures from zero.

The current repository already contains a substantial Futures foundation plus guarded BSC Testnet evidence. Master 7/1 therefore establishes what is reusable, what must be revalidated, and what is a genuine gap before any new Futures code is added.

## Reuse classification

### REUSE — current main

- `LQCFuturesMarketRegistry`
- `LQCFuturesVault`
- `LQCAggregatorOracleAdapter`
- `LQCPerpEngine` as the current **MVP/testnet on-chain engine**
- position/order/risk/liquidation application services
- funding application engine/controller
- fee application engine/controller
- Insurance Fund / ADL application services
- emergency controls and listing-activation gates
- Futures UI / service boundary / market-data tests
- BSC Testnet Registry/Vault/Oracle/Engine deployment record
- guarded BTC/USDT 5x LONG checkpoint
- current Futures test suites and CI workflow.

Nothing above is rewritten merely because Master 7 has opened.

## Evidence boundary

Repository tests, guarded Testnet deployment, and the first observed position checkpoint are different evidence levels.

The historical BSC record preserves:

- Registry: `0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0`
- Vault: `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`
- Oracle: `0xbf6a446c5e17228e70e45645ab47f751bdfc4b41`
- Engine: `0xe4f1320c8709631776c7e39e0916584935882525`

The first guarded BTC/USDT LONG checkpoint is preserved, but its full transaction hash was not captured and is not reconstructed.

Master 7/1 does not claim current artifact == deployed bytecode unless separately proven.

## Historical open-PR reconciliation

### PR #296 — runtime V3 TWAP reference adapter

Classification: **SELECTIVE REUSE CANDIDATE / REAL ORACLE GAP**

Current main has:
- V3 TWAP qualification/conversion tooling;
- a primary/reference deviation circuit breaker in `LQCAggregatorOracleAdapter`;
- a mock V3 TWAP pool for tests.

Current main does **not** contain the runtime `LQCV3TwapReferenceAdapter` proposed by #296.

Therefore #296 is not merged wholesale. Its adapter and tests are candidates for the next bounded Futures Oracle step after rebase/review against current main.

### PR #210 — off-chain cross-source deviation helper

Classification: **MOSTLY SUPERSEDED BY CURRENT ON-CHAIN CIRCUIT BREAKER**

Current `LQCAggregatorOracleAdapter` already:
- normalizes feed decimals;
- validates timestamps/rounds/heartbeat;
- accepts an independent reference feed;
- fails closed when configured deviation is exceeded.

The old #210 helper may remain useful as independent review tooling, but it is not a reason to duplicate the Core oracle rule.

### PR #250 — old parallel inventory

Classification: **SUPERSEDED AS STATUS DOCUMENT**

Its useful historical observations are absorbed into this current-main Master 7/1 record. Several items previously marked GAP now have repository implementations/tests, especially funding and Insurance/ADL application layers.

## Genuine current gaps

### G7-1 — independent runtime reference source

A reviewed production-style independent reference source still needs a runtime implementation and configuration/evidence path. #296 is the leading selective-reuse candidate.

### G7-2 — on-chain Perp completeness

The current `LQCPerpEngine` explicitly identifies itself as MVP/testnet and leaves funding, fees, partial-close and insurance as separate follow-up modules.

The repository has substantial funding/fee/insurance/ADL application-layer logic and tests, but those must not be misrepresented as already integrated on-chain Perp accounting.

### G7-3 — latest artifact/deployment reconciliation

Historical Testnet deployment is preserved. Current-main runtime identity versus the deployed Futures stack must be reconciled read-only before any claim of latest-artifact Testnet equivalence.

### G7-4 — canonical current-release Futures Testnet E2E evidence

Existing deployment and guarded-position evidence is substantial, but a canonical current-release bundle must bind the latest intended code/configuration, open/close/liquidation/funding/insurance evidence as applicable, without inventing missing transaction hashes.

### G7-5 — shared-interface integration

Futures may later consume reviewed Oracle/Router/Risk interfaces, but Futures margin/position accounting remains isolated from Lending.

## 7/1 exit rule

Master 7/1 passes only if:

1. current Futures contracts compile;
2. current Futures regression/security/oracle suites pass;
3. Futures↔Lending accounting isolation remains explicit;
4. historical Testnet evidence is preserved without overclaim;
5. #296/#210/#250 are classified against current main;
6. no deployment, market activation or user-fund transaction is authorized.

`activationAuthorized: false`

## Next

**Master 7/2 — Futures independent reference Oracle gap**

Start with selective review/rebase of PR #296's V3 TWAP runtime adapter. Do not merge the old PR wholesale.
