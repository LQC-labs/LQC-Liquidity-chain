# 76-17-⑥-⑤ / M24 — Price-adjusted collateral equity and liquidation-risk preview

**Result: ISOLATED RESEARCH PREVIEW 9 PASS / 0 FAIL, with 512 bounded fuzz runs. Real execution and operational collateral liquidation are NOT implemented / BLOCKED.**

## Evidence

- Read-only valuation module: `dex/contracts/futures/LQCFuturesM24CollateralRiskPreview.sol`
- Foundry tests: `test/LQCFuturesMigrationM24CollateralRiskPreview.t.sol`
- GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45055197367 — 9 PASS / 0 FAIL, including two fuzz properties at 256 runs apiece (512 total).
- Compiler configuration: Solidity 0.8.30, viaIR, optimizer runs 200, Shanghai. Test uses two isolated `MockPriceFeed` instances, not independently audited live feed providers.
- No Engine/Vault or canonical code changes. This module cannot move user assets, call Registry, or execute liquidation.

## Valuation model

- For mock collateral believed to be USD-denominated, supporting token base units with 6 or 18 decimals, normalize to USD18.
- Obtain two fresh and mutually consistent collateral/USD feeds; take the **lower** quote to avoid overvaluing margin.
- No minimum price floor for a risk read: even a collateral quote below M23's new-position floor of 0.95 USD must be considered to value existing exposure.
- Price-adjusted locked margin USD18 = `marginUnits * 10^(18-decimals) * collateralUsd18 / 1e18` (floor).
- Unrealized PnL USD18 = signed `sizeUsd18 * (markPrice18 - entryPrice18) / entryPrice18` (long, sign reversed for short).
- Risk equity = price-adjusted margin + PnL (USD18), compared with maintenance = USD18 notional * maintenance bps / 10000.
- The preview accepts a caller-supplied mark/entry price and maintenance parameter; **do not trust arbitrary caller values in an executable liquidation**. A production Engine must read authenticated market Oracle and Registry values itself.

## Exact illustrative tests

- 500 six-decimal token units at 1 USD, 2,000 USD notional and unchanged index mark: equity 500 USD, maintenance 100 USD, not liquidatable.
- The same exposure at collateral 0.90 USD: equity 450 USD, maintenance 100 USD, not liquidatable.
- With 20% long loss (-400 USD), at par equity 100 USD, at 0.90 USD equity 50 USD, both at/below 100 USD maintenance, but risk deepens under depeg.
- With collateral at 0.70 USD and -400 USD long PnL: equity -50 USD. Preview still reads price below M23 admission floor, marking exposure risky rather than discarding it.
- At both 6 and 18 collateral decimals, equivalent token quantities and feed conditions return equivalent USD risk results.
- Stale/future/divergent feed observations revert (fail closed) instead of assuming parity. The simulator does not silently fall back to 1 USD.
- Fuzz: 256 randomly generated collateral values across 6/18 decimals agree on valuation, 256 randomly generated paired collateral prices show lower USD price cannot raise risk equity.

## Critical blockers

1. **Actual liquidation execution remains unmodified.** `LQCPerpEngineM23AdmissionCandidate.sol` still settles actual PnL/margin in raw collateral token units. A read-only USD18 risk preview cannot be directly substituted for its execution accounting without explicit conversion, price bounds, conservation rules and economic policy decisions.
2. **Depeg creates FX settlement risk.** At collateral price <1 USD, a fixed USD loss needs *more* collateral tokens to pay; merely multiplying collateral margin by a lower USD price is insufficient for correct PnL/Funding/Insurance settlement.
3. **Feed sources are mock-only**, and two addresses are not evidence of independent price production. Real pricing and guardian recovery require reviewed sources, observed staleness policy, heartbeat, confidence/deviation and source licensing.
4. **No forced-liquidation triggers or permissionless keeper automation** and no authenticated market mark price in this preview; this is intentionally read-only.
5. **No complete risk audit:** adverse margin rounding, collateral haircut, protocol insurance loss-sharing, insolvency, flash-loan attacks, token price gaps, market-closure redemptions and multi-collateral support unresolved.
6. **Operational status** remains BLOCKED: no audited Oracle/production Safe proofs, no independent security review, M07 historical migration remains BLOCKED, M14 new deployed stack NOT_RUN, PR #460 still Draft/unmerged.

## Next engineering recommendation

M25 should develop a **separate isolated USD18-to-collateral FX settlement simulator** with conservative rounding, recognized bad debt, Insurance ceilings and complete Vault backing invariants for both 6- and 18-decimal tokens. Only after validated accounting should a new isolated Engine prototype consider a valuation-aware liquidation path. Preserve user rights, source provenance and explicit operational approval gates.

**No main merge, PR #460 change, on-chain transaction, deployment, signer authorization, existing Vault `setEngine`, or asset movement.**
