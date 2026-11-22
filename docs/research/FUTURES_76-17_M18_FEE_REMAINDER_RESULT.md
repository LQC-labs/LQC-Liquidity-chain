# 76-17-⑥-⑤ / M18 — Isolated fee remainder candidate and economic reconciliation

**Status: ISOLATED RESEARCH CANDIDATE 17/17 PASS; EIP-170 SIZE PASS; ECONOMIC POLICY / INDEPENDENT SECURITY REVIEW BLOCKED.**

## Source separation and evidence

- Existing baseline `dex/contracts/futures/LQCPerpEngine.sol` **not changed**.
- Separate research-only candidate: `dex/contracts/futures/LQCPerpEngineM18FeeRemainderCandidate.sol`.
- Focused Foundry test: `test/LQCFuturesMigrationM18FeeRemainder.t.sol`.
- Focused GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45050486594 — 17 PASS / 0 FAIL, scoped candidate, mocks only.
- Runtime build: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45050570655 — Solidity 0.8.30 viaIR, optimizer 200, Shanghai, candidate deployed runtime **16,935 bytes**, below EIP-170 **24,576 bytes**. This verifies byte count under the specified compiler options, not real deployment authorization.
- Original M17 vulnerable fee behavior remains separately reproduced in `test/LQCFuturesMigrationM17Boundary.t.sol` and documented in `docs/research/FUTURES_76-17_M17_BOUNDARY_FEE_FINDING.md`.

## Candidate fee accounting method

`_chargeTradingFee(account,marketId,token,notional)` carries a numerator remainder (0..9999) per account/market:

```
full = notional * feeBps + previousFeeRemainder
fee = floor(full / 10000)
newFeeRemainder = full % 10000
insuranceFull = fee * insuranceShareBps + previousInsuranceRemainder
insurance = floor(insuranceFull / 10000)
newInsuranceRemainder = insuranceFull % 10000
treasury = fee - insurance
```

Remnant persists across position close/reopen and is not advanced on EVM revert. When a tiny reduction itself rounds to 0 charged fee, it retains the fractional part for later collection. This is only a candidate policy, not an approved product fee specification. It assumes consistent unit semantics for `sizeUsd` and the collateral token base unit, which MUST be separately validated for supported token decimals.

## Confirmed focused scenarios

- Prior M09/M15/M16 accounting and M17 boundaries remain green under research candidate.
- M17's 100-base-unit / 1%-fee case: twenty 5-unit reductions now cumulatively charge **1 reduction-fee unit**, instead of zero.
- 60% Insurance share: an opening fee of 1 unit and cumulative close fee of 1 unit produce total fee 2, Insurance 1, Treasury 1, with 2000 basis-numerator Insurance remainder retained.
- Two users independently open 100 and then close 100 through (a) twenty slices and (b) one slice; total fees and Insurance/Treasury splits match, user available balances match, and Vault user+reserves=actual custody.
- A revert before completion leaves fee remainder and Vault balances unchanged.
- Remnant survives position close and new open; no reset silently forgives fractions.
- Under the tested profile candidate deployed runtime is 16935 bytes (< 24576 EIP-170).

## Open issues before changing canonical Engine

1. **Economic policy approval:** cumulative fee carry across close/reopen, administrative fee-rate and Insurance-share updates, behavior when a position remains closed forever with a nonzero fractional remainder, rebates/refunds and rounding fairness.
2. **Unit compatibility:** `sizeUsd` notional precision vs collateral token decimals, minimum fee policy and dust order sizing. Current formula is not a general-purpose decimal conversion.
3. **Per-account fee remainder can be circumvented across new addresses or markets** if rate/volume limits or minimum fees are not designed; scoped result is only same-account/market splitting equivalence.
4. **Security:** overflow, reentrancy, fee-on-transfer tokens and broader fuzz paths require separate analysis; current fixed-sequence test does not prove all states.
5. **Versioning/migration:** stateful remainder mappings change Engine storage and are not automatically transferable through `Vault.setEngine`. Historical M07 remains BLOCKED.
6. **Activation:** independent audit, real Oracle/Feed provenance, trusted Safe ownership and mainnet-ready E2E are not evidenced.

## Decision

M18 research fee candidate **PASS (scoped)**, runtime **SIZE_PASS**. Canonical Engine change, PR #460 changes, merge, production deployment, governance signature, real historical Vault migration, and asset movement **NOT AUTHORIZED**.

Next substantive work: evaluate decimals-aware fee policy and fee-rate-change / Insurance-share-change boundary tests in an isolated research candidate, then seek product-owner economic rules and independent review before altering a canonical engine.
