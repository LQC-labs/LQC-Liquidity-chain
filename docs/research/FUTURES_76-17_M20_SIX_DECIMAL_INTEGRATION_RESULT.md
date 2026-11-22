# 76-17-⑥-⑤ / M20 — Actual six-decimal synthetic collateral integration

**Status: ISOLATED SIX-DECIMAL MOCK INTEGRATION 2 PASS / 0 FAIL. MIXED DECIMAL PRODUCT READINESS BLOCKED.**

## Verifiable source and run

- Synthetic token contract with 6 decimals: `test/mocks/M20MockCollateral6.sol`.
- Scoped Foundry tests: `test/LQCFuturesMigrationM20SixDecimalIntegration.t.sol`.
- CI: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45051455968 — 2 PASS, 0 FAIL. Compiler Solidity 0.8.30 viaIR optimizer 200, Shanghai.
- M18 fee remainder candidate used for the test, baseline `dex/contracts/futures/LQCPerpEngine.sol` untouched.
- No production token, wallet, signing, chain RPC or deployment.

## Test A — Mix of canonical 18-decimal USD notional and six-decimal collateral

- User deposits 3,000 mUSD6 (3,000e6 units) to a real instance of the research Vault.
- Position open proposed: 500e6 collateral margin and 2,000e18 USD notional (10x maximum leverage).
- The unmodified M18 research Engine directly compares `sizeUsd * BPS` against `margin * maxLeverageBps` without decimal conversion.
- Result: `LeverageTooHigh` revert **with no Vault or Insurance accounting mutation**. This is **reproduction of an unsupported mixed-decimal configuration**, NOT successful 18-to-6 precision conversion.

## Test B — All position quantities manually expressed on six-decimal common scale

- Synthetic 6-decimal token deposited: 3,000e6 base units.
- Position: 500e6 margin, 2,000e6 notional, 1% trading fee.
- Opening 20e6 fee partitions 12e6 Insurance and 8e6 Treasury.
- Funding index update creates 2e6 debit.
- Mock price drops from 50,000 to 45,000; long closes with 200e6 loss. Closing 20e6 fee creates another 12e6 Insurance and 8e6 Treasury.
- User available after close: 2,758e6; all positions closed and margin unlocked.
- User withdraws 2,758e6. Vault retains 242e6, comprised of 40e6 segregated Insurance/Treasury fees, 2e6 Funding pool, and 200e6 realized synthetic loss retained as excess Vault backing. Note that realized loss is **not automatically credited to Insurance/Treasury** by the existing contract.
- This run succeeds because *both margin and notional were deliberately represented with six decimals*. It is not proof of correctness for a protocol-wide USD-18 notional convention.

## Decision / productive next implementation

**M20 integration test passes, but production mixed-decimal support remains BLOCKED.** Explicitly define a canonical USD-notional unit (likely USD-18), supported token decimals, and exact rounding/overflow rules. Apply conversions consistently to leverage, USD notional/OI, PnL, fee charge, Funding, liquidation margin, insurance coverage and withdrawal-related cash ledger.

Safest next prototype: a **separate research-only full-path decimal adapter/Engine candidate**, not one formula patched in the current Engine. Add tests comparing equivalent economic trades in 6-decimal and 18-decimal collateral, with consistent cash and USD notional valuations; reject unsupported precision rather than silently truncating. Configure any optional fee rate/share epoch policy explicitly. Verify actual runtime bytecode size and obtain independent review before considering canonical source modification.

## Protection and provenance

M07 migration BLOCKED, M14 new real-stack candidate NOT_RUN, PR #460 remains independent Draft, and existing BSC Testnet historic 5,000 mUSDT user rights are untouched. No `main` merge, old Vault `setEngine`, operational deployment, signatures or real user asset transfers.
