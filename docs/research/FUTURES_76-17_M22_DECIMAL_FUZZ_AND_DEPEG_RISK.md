# 76-17-⑥-⑤ / M22 — Focused decimal, Funding and collateral-depeg risk properties

**Result: ISOLATED FOUNDRY 31 PASS / 0 FAIL, including five fuzz properties at 256 runs each (1,280 fuzz cases). Collateral depeg pricing remains UNSUPPORTED/BLOCKED.**

## Evidence and precise scope

- Candidate source unchanged: `dex/contracts/futures/LQCPerpEngineM21Usd18Candidate.sol`.
- Six-decimal mock test extensions: `test/LQCFuturesMigrationM21Usd18SixDecimal.t.sol`.
- Eighteen-decimal mock test extensions: `test/LQCFuturesMigrationM21Usd18Regression.t.sol`.
- First focused GitHub run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45052339039 — 29 PASS (20 existing 18-decimal + 9 six-decimal including 3 fuzz at 256 runs).
- Second, final focused GitHub run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45052428340 — **31 PASS** (22 eighteen-decimal including 2 fuzz + 9 six-decimal including 3 fuzz).
- Fuzz test matrix: `testFuzz_M22_RepresentableOpenFeeConservation`, `testFuzz_M22_RepresentableUsd18PartialReductionConservation`, `testFuzz_M22_FundingOneIndexCheckpointCannotDoubleCharge`, `testFuzz_M22_EighteenDecimalFeeInsuranceReserveConservation`, `testFuzz_M22_EighteenDecimalRepeatedFundingCannotDoubleDebit` — **5 × 256 = 1,280 generated input cases**. This is bounded, seeded random-input testing, NOT mathematical proof for all inputs.
- Fixed-sequence depeg characterization: `test_M22_UnpricedCollateralDepegIsNotCoveredByUsd18Conversion`. PASS refers to successful reproduction of the missing protection.
- Compiler Solidity 0.8.30 viaIR optimizer 200, Shanghai EVM. No actual chain transaction, production deployment, asset transfer, signer, historical Vault `setEngine`, PR #460 modification or main merge.

## Supported findings

1. Across tested 6-decimal input ranges (notional 1..2500 USD, fee 1..300 bps), USD18 `sizeUsd` remains in USD18 and cash fees/reserves use six-decimal token units. The user-available + locked and physically backed segregated balances are consistent for one position/account.
2. Across tested 6-decimal partial reduction sizes (initial notional 501..2000 USD, reduction 1..notional-1 USD), open-interest decreases by exactly the requested USD18 notional and Vault user-account totals remain consistent.
3. Across tested 6-decimal Funding-notional values (1..2000 USD), a repeated Funding checkpoint without index advancement does not debit a second time.
4. Across tested 18-decimal notional values (1..2400 USD), fee/Insurance splits and Vault accounting conserve balances; repeated Funding checkpoints cannot double-debit.
5. The existing M21 fixed-sequence six-decimal full and partial liquidation, Insurance/bad-debt, closing, and user withdrawal tests remain PASS under the same candidate.

## Material open risk: collateral depeg

The current M21 implementation treats supported six- or eighteen-decimal collateral as **exactly 1 USD per collateral token**. Decimal scaling is not exchange-rate pricing. `test_M22_UnpricedCollateralDepegIsNotCoveredByUsd18Conversion` models a hypothetical value fall to 0.70 USD: the calculation shows that the margin value in real USD would fall, but the market remains ACTIVE because no collateral/USD oracle, depeg threshold or risk circuit breaker is wired to this event. This is an *unmitigated economic/risk defect*, not a passed depeg mitigation.

The test does **not** modify a genuine price source or assert a real on-chain collateral depeg. Production acceptance must require independently verified collateral valuation and conservative collateral-factor, stale-feed/failure fallback, liquidation/halts and depeg thresholds before supporting non-1:1 assets.

## Limitations and decision

- The fuzz ranges are bounded. No high-magnitude overflow fuzz, signed Funding credit/debt adversarial sequences, insurance-credit wash, cross-account sequence fuzz, flash-loan manipulation or property-based whole-system proof was performed.
- The research candidate rejects USD18 notionals below the 6-decimal quantum (instead of rounding), and the forced full-liquidation fallback when partial reductions round to zero remains an **unapproved policy**.
- Fee-rate / Insurance-share epoch treatment unresolved (M19), closed Funding obligations unresolved (M07), independently complete historical account inventory unresolved (M08), new live stack address evidence missing (M14), Oracle/Safe/independent audit missing (M12).
- Earlier EIP-170 size at M21 checked 17,730 bytes for the *unchanged candidate* under specific compiler options; no new runtime build performed in M22.

**M22 focused accounting testing PASS / product economic safety BLOCKED / production deployment NOT AUTHORIZED.**

Recommended next substantive scope: M23 targeted negative/economic implementation design for collateral depeg protection, using a **separate isolated research candidate or oracle-risk adapter** and independent collateral/USD feed source. No unapproved canonical Engine change, governance activation or asset movement.
