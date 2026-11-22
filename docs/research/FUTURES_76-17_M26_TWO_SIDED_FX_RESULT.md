# 76-17-⑥-⑤ / M26 — Two-sided FX quote and protected Vault surplus research

**Result: ISOLATED RESEARCH PREVIEW 11 PASS / 0 FAIL, two fuzz tests × 256 runs = 512 inputs. EXECUTABLE SETTLEMENT AND OPERATIONAL RELEASE BLOCKED.**

## Sources, runtime and test provenance
- Source: `dex/contracts/futures/LQCFuturesM26TwoSidedFxPreview.sol`.
- Tests: `test/LQCFuturesMigrationM26TwoSidedFx.t.sol`.
- Final focused GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45059849323 — 11 PASS / 0 FAIL; includes two fuzz tests 256 runs each.
- Initial 9 PASS focused run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45059755961, before adding token-decimals identity and residual-debt payout controls.
- Dependencies: M24 `LQCFuturesM24CollateralRiskPreview`, M25 `LQCFuturesM25FxSettlementPreview`, Vault state and ERC20 balance/decimals.
- Test compiler: Solidity 0.8.30, viaIR, optimizer 200, Shanghai. No production runtime EIP-170 measurement performed on M26 (no deployment authorized).

## Directionally conservative price selection

- Require two contemporaneously fresh and mutually consistent price feeds. M24 source returns minimum quote; new M26 module independently reads maximum quote under M24 validation.
- USD loss to collateral units: `ceil(USD18 loss × 10^decimals / lower USD18 quote)`. This uses the existing M25 lower-quote loss model.
- USD profit to collateral units: `floor(USD18 profit × 10^decimals / upper USD18 quote)`, rather than M25's potentially overpaying lower-price conversion.
- Tested at feed observations $0.80 and $0.82/token: $100 loss requires 125 six-decimal whole tokens; $100 profit preview is 121.951219 token units for a six-decimal ERC20, with any fractional base unit excluded.
- The lower/upper feed quotes are **two potentially correlated external reports**, not a market bid/ask spread, provable executable exchange prices or independent sources. This price policy is only a research candidate.

## Source-of-truth physical reserve check
- `unreservedVaultSurplus(token)` reads `IERC20(token).balanceOf(Vault)`, `totalAccounted`, `fundingPoolBalance`, `insuranceFeeReserve`, `treasuryFeeReserve` from the same read-only call context, and requires physical assets >= summed protected balances.
- `previewBoundedProfit` computes profit token candidate and requires it <= measured unreserved surplus. It additionally verifies caller-supplied decimals match the token's observed `decimals()` and fails closed if Vault has nonzero `residualBadDebt(token)`.
- Example synthetic six-decimal token: Vault physically owns 1200 tokens; user is owed 1000 tokens; unreserved physical excess is 200 tokens. A $100 profit at $0.82 quote gives proposed 121.951219 token payout and leaves 78.048781 available excess *on paper*; the function DOES NOT transfer tokens or change Vault state.
- An attempted $200 profit against a 200-token reserve is rejected due to insufficient physical unreserved excess. Insurance, Treasury and Funding reserves cannot be counted toward distributable excess in the model.
- A separately recorded residual bad debt of 10 tokens blocks profit allowance even though physical excess remains 200 tokens. This is more restrictive than the earlier physical-backing-only model.
- Actual six- and eighteen-decimal token contract fixtures are used. Mock Vault grants test contract sole Engine rights within this synthetic environment to seed insurance/funding and debt, not real-world authorization.

## Tests and remaining blockers
- Fixed scenarios include quote direction, actual Vault excess, insufficient excess, explicit Insurance/Treasury/Funding protection, 6/18 decimal equivalence, stale/divergent price denial, invalid decimals, falsified decimals and outstanding residual debt.
- Fuzz: increasing upper collateral/USD quote cannot increase computed profit tokens; candidate payout never exceeds physical unreserved surplus in the bounded seeded inputs (512 runs total).
- **Unresolved property rights and solvency:** surplus physical token units may represent old losses, unreconciled protocol obligations or unrecognized claims; its ownership and distribution are NOT proven by the Vault's existing accounting mappings. A physical-surplus calculation cannot establish permission to pay.
- **No executable payout:** the source is read-only; no Vault cash movement, market Oracle authentication, signed update, or production E2E is implemented.
- Real collateral/oracle source independence, liquidity convertibility, bid/ask slippage, market stress, decimal spoofing by untrusted tokens, extreme overflow bounds, reserve debt policies and audit require independent review.
- M07 historical migration and M14 new-stack on-chain provenance remain BLOCKED. PR #460 remains separate Draft review; no canonical Engine or `main` changes, old Vault `setEngine`, wallet signature, contract deployment, or historical user asset movement occurred.

## Next engineering priority
M27 should examine the ledger provenance of protocol **surplus and realized losses**, including whether excess is encumbered by claims other than the four on-chain reservation mappings; specify a positive authorization source for profit liquidity before any executable settlement. An isolated read-only entitlement and provenance check is preferable to adding a new payout function without review.
