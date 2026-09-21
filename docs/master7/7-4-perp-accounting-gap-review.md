# Master 7/4 — Futures Perp Accounting Gap Review

Status: **current-main gap classification gate**

## Purpose

Identify the remaining **real on-chain accounting gaps** after 7/1–7/3, so 7/5 develops only what is missing.

This review does not downgrade the existing application-layer Futures work. It separates:

- current on-chain contract capability;
- current tested application/service capability;
- historical Testnet evidence;
- production/on-chain gaps.

## Current on-chain contract surface

### Reuse as-is

`LQCPerpEngine` currently provides:

- isolated-margin position open;
- full position close;
- full liquidation trigger;
- Oracle-priced PnL;
- leverage ceiling enforcement;
- maintenance-margin liquidation check;
- collateral lock/unlock and realized PnL settlement through `LQCFuturesVault`.

`LQCFuturesVault` provides:

- collateral deposits/withdrawals;
- available vs locked balance accounting;
- engine-only collateral lock/unlock;
- engine-only realized PnL settlement;
- total-accounted solvency boundary.

These remain valid foundations and should not be rebuilt.

## Gap classification

| Capability | Application/service layer | Current on-chain Perp/Vault | 7/5 classification |
|---|---|---|---|
| Funding | Implemented and tested — rate/payment + guarded account/position settlement | **Absent** | **REAL GAP** |
| Trading fees | Implemented and tested — maker/taker fee + insurance/treasury split | **Absent** | **REAL GAP** |
| Partial close / reduce | Implemented and tested in position engine/book | On-chain `closePosition` is full close only | **REAL GAP** |
| Partial liquidation | Implemented/tested in application liquidation engine | On-chain liquidation closes the whole position | **REAL GAP / integrate with liquidation accounting** |
| Insurance Fund | Implemented/tested as demo shared state/service | No on-chain Insurance Fund custody/accounting | **REAL GAP** |
| Bad debt accounting | Explicit in application Insurance/ADL path | No explicit on-chain residual bad-debt state | **REAL GAP** |
| ADL | Implemented/tested as deterministic application model | No on-chain ADL state/action | **REAL GAP, but last-resort scope** |
| Funding/fee/insurance interaction | Tested in app/controller integration | Not bound to on-chain position lifecycle | **REAL INTEGRATION GAP** |

## Important evidence correction

The application-layer Funding, Fees, Insurance and ADL code is substantial and reusable. It must **not** be described as missing product logic.

The missing part is their **canonical on-chain settlement/accounting integration** with the deployed-style Futures Engine/Vault.

Likewise, the BSC Testnet MVP Engine remains a valid verified deployment lineage. It is not production-complete merely because the repository contains richer application-layer accounting.

## 7/5 implementation strategy

Use the smallest auditable extension rather than replacing the Engine/Vault.

### A. Position reduction primitive

Add a bounded on-chain position reduction path that:

- supports partial and full reduction;
- realizes PnL only on the reduced notional;
- releases proportional margin safely;
- preserves remaining entry-price/accounting invariants;
- prevents over-reduction and stale/zero-size residue.

This primitive is also required for bounded partial liquidation and later ADL.

### B. Funding accounting

Add explicit per-market cumulative funding state and per-position funding checkpointing.

Requirements:

- bounded funding rate;
- deterministic long/short transfer sign;
- settlement before position size changes;
- no hidden token minting;
- funding conservation across counterparties/protocol policy;
- stale Oracle/mark data fail-closed.

Exact interval/rate economic constants remain configurable Governance parameters, not invented in this gate.

### C. Trading fee accounting

Add explicit execution fee accounting on position increase/reduction.

Requirements:

- bounded maker/taker policy;
- exact charged amount observable in state/events;
- explicit Insurance/Treasury allocation;
- no fee debit larger than available account equity;
- no dependency on DEX Router fee accounting.

### D. Insurance / bad-debt boundary

Create a Futures-only Insurance accounting/custody boundary.

Requirements:

- fee-funded reserve deposits;
- liquidation deficit coverage;
- per-event/global Governance bounds;
- explicit residual bad debt when Insurance is insufficient;
- no use of Lending reserves or LQC Staking funds.

### E. ADL boundary

Do **not** silently embed a broad automatic ADL system before the reduction primitive, Insurance accounting and bad-debt conservation are proven.

7/5 may add the minimal deterministic ADL accounting hook/primitive needed to consume explicit residual bad debt through bounded opposing profitable-position reduction. Full risk/Governance activation remains 7/6.

## Dependency order inside 7/5

1. partial position reduction;
2. funding checkpoint/accounting;
3. fee accounting + reserve routing;
4. Insurance / residual bad debt;
5. partial liquidation using reduction primitive;
6. bounded ADL primitive;
7. integrated regression/invariants.

This order minimizes repeated changes to the position lifecycle.

## Invariants for 7/5

- Futures remains independent from Lending accounting.
- No Futures loss may be charged to Lending suppliers or LQC Stakers.
- Position size cannot become negative or silently disappear.
- Margin + realized PnL + fees + funding + Insurance/bad-debt deltas must reconcile.
- Partial close and partial liquidation use one canonical reduction primitive.
- Insurance coverage cannot exceed available reserve or configured bounds.
- Residual bad debt is explicit.
- ADL cannot absorb more than explicit residual bad debt or realizable opposing profit.
- Oracle failure remains fail-closed.
- Existing full-close/full-liquidation behavior must remain regression-covered until intentionally superseded.

## 7/4 exit meaning

Passing 7/4 means:

**THE ON-CHAIN FUTURES GAP SET IS IDENTIFIED AND ORDERED FOR 7/5**

It does not mean those gaps are already implemented.

No Testnet transaction, deployment, market activation or user-fund action is authorized.

`activationAuthorized: false`

## Next

**7/5 Selective On-chain Futures Gap Implementation + Regression**

Implement only the gap set above on current `main`; reuse the existing application-layer math/tests as specification evidence where compatible.
