# 76-17-⑥-⑤ / M23 — Isolated collateral USD depeg risk admission and Engine linkage

**Status: RESEARCH TESTS PASS (7 guard + 13 integration), EIP-170 SIZE PASS (two contracts), COLLATERAL-VALUATION ECONOMIC SAFETY BLOCKED.**

## Evidence and pinned source

- Independent guard: `dex/contracts/futures/LQCFuturesM23CollateralDepegGuard.sol`.
- Separate research Engine candidate: `dex/contracts/futures/LQCPerpEngineM23AdmissionCandidate.sol`.
- Guard-only tests: `test/LQCFuturesMigrationM23CollateralDepegGuard.t.sol`, GitHub run https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45053670329 — **7 PASS / 0 FAIL**, including 256 fuzz price-floor cases.
- New Engine admission integration: `test/LQCFuturesMigrationM23AdmissionIntegration.t.sol`, GitHub run https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45053798014 — **13 PASS / 0 FAIL**, including the inherited six-decimal USD18 integration and four new admission/exit tests.
- Runtime size: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45053874950 — Engine **18,111 bytes**, Guard **1,782 bytes**, each within EIP-170 limit 24,576 bytes, Solidity 0.8.30 viaIR, optimizer 200, Shanghai EVM.
- The canonical Engine `dex/contracts/futures/LQCPerpEngine.sol` and historical BSC Testnet Vault/Engine are **unchanged**. The new candidate is isolated and has no operational authority.

## Implemented read-only guard

- Constructor pins the collateral address and **two distinct mock/source feed addresses**. Distinct addresses alone do not prove independent feed operators or economic independence.
- Research-only policy: minimum USD value `0.95e18`, maximum feed deviation `500 bps`, quote freshness at most **120 seconds**.
- Both feed prices are normalized from up to 18 decimals to USD18. Zero/negative, stale, future, answeredInRound older than roundId, missing/bad feed responses and too-divergent prices all **fail closed**.
- For a valid pair, returns the **lower** observed price. This is a conservative observation, not a collateral haircut or general pricing engine.
- The guard does not itself mutate Registry state or grant Guardian authority.

## Engine integration

- New research Engine requires a deployed guard at construction; the guard must pin the same collateral token configured by the market.
- **Before** any Vault lock, fee charge, position storage write or OI mutation, `openPosition` requires `collateralGuard.admissionAllowed()`; failed admission reverts with `CollateralDepegAdmissionBlocked`.
- Existing position `closePosition` and `liquidate` do **not** call this admission check, preserving the independently tested exit/forced-liquidation routes on a depeg with a still-valid index-token price Oracle.
- Tests: normal admission, 0.90 USD depeg block, stale collateral feed block, no mutation after rejected opens, continued close and liquidation under depeg, authorized Guardian emergency halt. Guardian HALTED is a separate **authorized test action**, not automated by the guard.
- This design supports one hardcoded guard/collateral token per research Engine instance; it does not support multi-collateral production markets.

## Critical operational gaps (no false PASS)

1. The M23 Engine still measures collateral margin in *token units as though 1 token = 1 USD* for risk/leverage, maintenance, PnL and Funding. Guarding new opens at a floor is NOT equivalent to valuing collateral at its current independent USD market price; 0.96 USD collateral could still be overvalued for actual margin purposes.
2. No automatic halt/REDUCE_ONLY on future depeg or source outage. Monitoring, Guardian permissions, safe notification and governance-controlled recovery need independent architecture, audit and operating policies.
3. No liquidation haircut or value-based recalculation for existing positions during depeg; allowing liquidation calls does not prove they are economically sufficient or correct when the collateral price changes.
4. No verified production-grade independent collateral/USD feeds, proxy/implementation provenance, licensing, Safe ownership, approved reference source or alert/response SLA.
5. Research-only thresholds (95% price floor, 5% feed divergence, 120-second freshness) are not approved economic parameters. A depeg threshold could be too loose or too tight for real stablecoins.
6. EIP-170 size checks do not prove security or deployment authorization. End-to-end signed transactions, deployment E2E and independent security review remain blocked.
7. Full old-account coverage, M07 migration, M14 real new-stack addresses, PR #460 independent review remain BLOCKED. Historical 5,000 mUSDT known-user right is not moved.

## Next substantive gate

M24 should focus on **valuation-aware isolated margin and liquidation math**, with conservative collateral/USD conversion, explicit 6/18 decimal normalization, shock scenarios, stale feed failure policy and property-based accounting tests. Do not patch canonical Engine until policy, independent source provenance and security review are available.

**No main merge, PR #460 modification, historic Vault `setEngine`, private key, governance signature, actual deployment or asset movement.**
