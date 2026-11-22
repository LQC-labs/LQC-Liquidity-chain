# 76-17-⑥-⑤ / M21 — USD18 / collateral6-or-18 conversion prototype

**Status: RESEARCH CANDIDATE 25/25 PASS, EIP-170 SIZE PASS, OPERATIONAL RELEASE BLOCKED.**

## Source and verification

- Canonical `dex/contracts/futures/LQCPerpEngine.sol` unchanged.
- M18 research version unchanged: `dex/contracts/futures/LQCPerpEngineM18FeeRemainderCandidate.sol`.
- NEW isolated full-path research candidate: `dex/contracts/futures/LQCPerpEngineM21Usd18Candidate.sol`.
- Actual six-decimal mock: `test/mocks/M20MockCollateral6.sol` (no real currency).
- USD18 / six-decimal integration: `test/LQCFuturesMigrationM21Usd18SixDecimal.t.sol` — 5 PASS.
- Eighteen-decimal prior regression: `test/LQCFuturesMigrationM21Usd18Regression.t.sol` — 20 PASS.
- Focused CI: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45051846197 — 25 PASS / 0 FAIL.
- Runtime-size CI: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45051929255 — deployed runtime **17,730 bytes**, below EIP-170 limit **24,576 bytes** (6,846 bytes headroom), Solidity 0.8.30 viaIR optimizer 200 EVM Shanghai.

## Candidate unit semantics

- Position `sizeUsd`, market `openInterestUsd`, market notional limits, and all user-facing reduction-size inputs retain **18-decimal USD notional units**.
- Vault balances, collateral `margin`, realized PnL, TradingFee, Funding credit/debit, Insurance and Treasury reserves, and bad debt use **ERC20 native base units**.
- Candidate supports explicit `decimals()` only **6 or 18**, with `quantum = 10^(18 - decimals)`.
- A USD18 amount entering a cash-settlement path must be exactly representable in native token units: `usd18 % quantum == 0`, else `NonRepresentableUsdAmount`. Unsupported collateral decimals revert.
- Conversions are applied to leverage comparison, PnL, maintenance threshold, Funding numerator, trade fees, liquidation deficit and Insurance flow, and ADL PnL. USD-denominated OI remains unchanged.
- Partial-liquidation reduction is quantized to a representable USD18 multiple; if the resulting slice becomes 0, the candidate elects full liquidation. That behavior is only a research proposal, NOT an approved liquidation policy.

## Verified cases

1. USD18 notional 2,000 USD (`2000e18`) with six-decimal margin 500 (`500e6`) opens at 4x leverage, debits correctly scaled 20 six-decimal units in fees and partitions 12 to Insurance / 8 to Treasury.
2. USD18 notional containing a sub-base-unit fraction (`2000e18 + 1`) reverts before locking collateral or changing OI.
3. Six-decimal USD18 lifecycle including positive index update, 2 six-decimal units of Funding debit, 10% unfavorable price move, full close with realized 200 six-decimal-unit loss, and a 2,758-unit user withdrawal preserves Vault accounting.
4. Six-decimal full liquidation with 500-unit uncovered loss, 12 units Insurance applied, **488 units residual bad debt** and correctly unsolvent `isSolvent` status, while physical Vault backing remains.
5. Six-decimal 50% partial liquidation against an adverse 50,000→38,000 mock price correctly reduces USD18 OI from 2,000 to 1,000, adjusts 6-decimal margin from 500 to 260, and does not introduce bad debt.
6. Twenty inherited 18-decimal mock account scenarios covering legacy-stack separation, account/Insurance/Funding, small fees, rate transitions and other bounded cases remain PASS.

## Limitations and blocking decisions

- This **assumes collateral is denominated 1:1 in USD**. No collateral depeg handling, exchange-rate conversion, multi-collateral FX normalization, or non-USD collateral pricing is implemented. Therefore not general collateral support.
- Exact-representability rule may cause operations with tiny fractional USD notional to revert. The rounding/quantum and forced-full-liquidation policy needs explicit economic, risk and user-facing approval.
- Oracle live feed implementation/proxy provenance, production staleness, signers/Safe custody, broad fuzz testing, negative-value bounds and external security audit not independently complete.
- Inherited synthetic tests are **not** a substitute for broad invariant/fuzz coverage or independent code audit.
- Full closed-Funding-claim disposition, M07 historical migration, M14 real new-stack contract existence and PR #460 review remain BLOCKED.
- Runtime bytecode size under one compiler profile is **not** deployment permission.
- No actual testnet deployment, signing, on-chain transaction, historical Vault `setEngine`, movement of historical 5000 mUSDT, canonical Engine change, main merge or PR #460 modification.

## Next substantive engineering priorities

M22: fuzz and boundary-test conversion monotonicity, notional representability, fee rounding across 6/18 decimals, Funding conservation, partial-liquidation quantization and depeg/collateral-price risks in isolation. Resolve approved policy and no-USD collateral support decision before any canonical integration.
