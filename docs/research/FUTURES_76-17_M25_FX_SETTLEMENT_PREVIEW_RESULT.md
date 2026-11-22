# 76-17-⑥-⑤ / M25 — Collateral depeg FX settlement preview

**Result: ISOLATED READ-ONLY PROTOTYPE 11 PASS / 0 FAIL, including three fuzz tests × 256 runs = 768 cases. EXECUTABLE FX SETTLEMENT / PRODUCTION RELEASE BLOCKED.**

## Reproducible evidence
- Research source: `dex/contracts/futures/LQCFuturesM25FxSettlementPreview.sol`
- Scoped tests: `test/LQCFuturesMigrationM25FxSettlement.t.sol`
- CI: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45058985371 — 11 PASS / 0 FAIL (8 fixed tests and 3 fuzz tests, 256 cases per fuzz test).
- Uses M24 lower-of-two-fresh-feeds `LQCFuturesM24CollateralRiskPreview.collateralUsd18()`; real Oracle provenance and independence are unverified.
- Solidity 0.8.30 viaIR, optimizer 200, Shanghai. No new Engine, Vault, token or chain mutation.

## Modelled units, rounding and sample
- USD obligations in USD18, collateral cash in 6- or 18-decimal native token units.
- Loss: `ceil(lossUsd18 × 10^tokenDecimals / collateralUsd18)` token base units.
- Profit candidate: `floor(profitUsd18 × 10^tokenDecimals / collateralUsd18)` token base units. **Important: lower-quote selection is not conservative for a protocol paying profits**; it may overpay relative to a higher trusted quote. The profit path is therefore only a characterized candidate, **NOT approved** for actual payouts.
- Loss waterfall: apply locked margin first; remaining deficit may use `min(actualInsuranceReserve, floor(deficit × maxInsuranceBps/10000))`; record the rest as residual bad debt. Insurance limits apply *after* margin usage, not before.
- Treasury and Funding reserves are explicitly excluded from the loss waterfall; simulator returns them unchanged.
- Example at $0.80/token: $100 loss costs 125 token units (whole-token representation).
- Example at $0.80/token: $600 loss requires 750 token units; locked margin 500, Insurance reserve 20, max Insurance share 100%, Treasury 10, Funding 7 => Insurance used 20 and explicit residual debt 230, without consuming Treasury/Funding.
- With 50% Insurance coverage and Insurance reserve 200 in same $600 example: deficit 250, Insurance used 125, residual 125.
- Zero Insurance coverage: Insurance unchanged, deficit fully recorded as residual bad debt.
- Tiny losses use ceiling token-base-unit rounding, payouts floor; supported decimals restricted to 6 or 18, stale/divergent feed failures revert.
- Profit preview explicitly reverts if requested token payout exceeds *caller-asserted* available unreserved excess. The caller input is not authenticated Vault excess and MUST NOT be trusted by operational settlement.

## Bounded fuzz evidence
1. Across positive USD loss sizes and prices within 1–100 cents, the 6-decimal required loss agrees with the 18-decimal required loss when the latter is rounded up to the coarser base unit.
2. Lower USD collateral price never reduces required collateral tokens to cover the same loss.
3. Under varied USD losses, collateral margin, Insurance reserves and coverage caps, each token-base-unit liability equals `consumedMargin + insuredTokens + residualBadDebt`; available reserves reconcile and Treasury/Funding remain constant.

## Critical limitations and blockers
- **No on-chain settlement, Vault wiring or Engine execution.** Numerical conservation is not a proof that actual Vault user liabilities remain solvent or that token liquidity is available. The source only returns numbers.
- **FX asymmetry:** lower observed price is conservative for a loss owed **in USD**, but may overstate a profit payout **in collateral units**. Before any profit path, independently define supported asset/payout currency, quote-side policy and auditable liquidity source; use an upper/conservative or bounded two-sided quote where economically appropriate.
- Current M24 preview accepts manually supplied position mark and maintenance; operational liquidation must read authenticated market Oracle and Registry states, not arbitrary function inputs.
- No approval for socialized losses, debt allocation, Insurance premium, collateral haircuts, liquidation incentives, fee-on-transfer collateral, multi-collateral pooling or depeg policy.
- Oracles are mock feeds only; two feed addresses are not proof of independence.
- No gas/size verification for M25 was required for the no-deployment read-only research module; do not infer EIP-170 acceptance from previous modules.
- M07 historical migration, M14 new on-chain candidate, independent audit, PR #460 security review, Safe and Oracle-source proof remain BLOCKED.

## Recommended next substantive engineering
M26: design a two-sided authenticated collateral valuation policy and verify FX profit/loss asymmetry, then add isolated Engine/Vault execution under explicit accounting constraints. Do not replace M23 entry guard or M24 risk preview with a cash settlement primitive without reviewing Oracle security and economic policy.

**No PR #460 modification, main merge, production deployment, historical Vault setEngine, wallet signature, or real token movement.**
