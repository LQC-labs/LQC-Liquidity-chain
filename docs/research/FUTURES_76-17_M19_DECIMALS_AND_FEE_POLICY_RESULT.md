# 76-17-⑥-⑤ / M19 — Fee precision and policy-transition boundaries

**Status: ISOLATED FOCUSED TESTS 20 PASS / 0 FAIL; DECIMALS-COMPATIBLE FUTURES ENGINE NOT IMPLEMENTED; ECONOMIC POLICY APPROVAL BLOCKED.**

## Evidence

- Scoped Solidity tests: `test/LQCFuturesMigrationM19DecimalsRateTransitions.t.sol` (17 inherited M09–M18 cases + 3 new M19 cases)
- GitHub Actions SUCCESS: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45050872061
- Test commit: `4c8b85d19502e4878fc45fac321df09dd69c4f01`.
- M18 candidate source unchanged: `dex/contracts/futures/LQCPerpEngineM18FeeRemainderCandidate.sol`; canonical Engine unchanged.
- Compiler Solidity 0.8.30 viaIR optimizer 200, EVM Shanghai. No real token movement, no deployment or signing.

## M19 case 1 — scale mismatch (isolated arithmetic regression)

`test_M19_CurrentCandidateRequiresNotionalAndCollateralSameBaseUnit` asserts a deliberately mismatched representation:
- `sizeUsd = 2000e18`, `margin = 500e6`, 10x leverage maximum.
- Without normalization, `sizeUsd * 10000 > margin * 100000`, which would reject an otherwise 4x economic position.
- Normalizing the margin to 18 decimals restores the expected leverage comparison.
- At 1% fee, the naive M18 calculation yields `20e18` collateral base units; properly scaled 6-decimal fee is `20e6` collateral base units.

**Scope caution:** This is an arithmetic demonstration using M18 candidate's formulas, not a live 6-decimal ERC20 integration test. The mock ERC20 used by existing M09–M18 test suites has 18 decimals. The mismatch affects leverage, realized PnL, settlement, Funding and margin accounting beyond just fee arithmetic; replacing one isolated fee formula is not a solution.

## M19 case 2 — fee-rate transition

At 1% fee, a 5-unit reduction carries 500 numerator remainder. Switching the configured fee rate to 0% and reducing another 5 units retains the prior 500, then reverting to 1% continues accumulation. The test shows current **carry-across-fee-rate epochs** behavior. Whether the old fractional fee is collectible after a zero-fee interval is a product/governance rule, not proven acceptable by passing tests.

## M19 case 3 — Insurance-share transition

At 60% Insurance allocation, a 1-unit fee yields 6000 numerator Insurance remainder. A subsequent 0% Insurance-share epoch does not burn the remainder, and restoring 60% can convert old fractions into an Insurance unit. This is **cross-policy-epoch attribution**, not automatically an approved or fair economic distribution.

## Findings and recommendation

1. **BLOCKED: general 6-decimal collateral support.** Define canonical USD notional precision, collateral token permitted decimals, conversion factors and rounding directions for all position and funding accounting, not just charging fees. Reject incompatible collateral until a full end-to-end design/test proves safety.
2. **BLOCKED: fee-rate policy transitions.** Decide whether fractional fee obligations survive fee-rate decreases, zero-rate intervals, and position closures, and how old vs new rate epochs are audited.
3. **BLOCKED: Insurance share reconfiguration policy.** Approve whether residual fractions can cross share-policy changes; alternatively record them per configuration epoch.
4. Expand tests to a genuinely independent six-decimal mock token with position open/reduce/close, liquidation, Funding, reserves, and user withdrawal, after specification is approved.
5. Independent audit, target-bytecode review, economic policy approval, new chain candidate provenance and PR #460 review remain necessary.

**Decision: M19 arithmetic/rate transition characterization PASS, but M18 candidate product readiness BLOCKED.** No canonical Engine changes, PR #460 modifications, main merge, existing Vault `setEngine`, governance signatures, contracts deployed or tokens transferred.
