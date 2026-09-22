# Master 7/5-3 — Futures Trading Fee Accounting / Reserve Routing

Status: **7/5 substep repository gate**

## Purpose

Implement the third ordered 7/5 substep by moving the already-tested application fee model into canonical Futures on-chain accounting without coupling it to DEX Router fees, Lending, or Staking.

## Implemented

### Per-market fee configuration

`LQCPerpEngine` now stores Governance-configured:

- trading fee in basis points;
- Insurance reserve share in basis points.

The remainder is routed to the Treasury fee reserve.

The protocol uses `BPS = 10_000` as a technical bounds denominator. No fixed maker/taker product fee is hard-coded in this gate.

### Direct Engine execution fee

The current direct Perp Engine charges the configured fee against executed USD notional on:

- position open;
- partial reduction;
- full close through the canonical reduction path.

Application-layer maker/taker fee logic remains reusable specification evidence, but a user cannot self-select a lower maker role in the current direct Engine path. A later reviewed execution/order module may reuse richer maker/taker policy without weakening the canonical accounting boundary.

### Segregated reserves

`LQCFuturesVault` now holds separate accounting buckets:

- `fundingPoolBalance[token]`;
- `insuranceFeeReserve[token]`;
- `treasuryFeeReserve[token]`;
- user `totalAccounted[token]`.

Fee collection moves an exact amount from the trader's available Futures balance into the two fee reserves.

The reserve balances remain inside the Futures Vault. They are **not spendable yet**. Insurance-loss coverage and residual bad-debt consumption are deferred to 7/5-4. Treasury withdrawal/governance policy remains a later Governance boundary.

### PnL reserve protection

Positive PnL settlement may use only genuinely unaccounted Vault liquidity.

Funding pool assets, Insurance fee reserves and Treasury fee reserves are excluded from positive-PnL backing. This prevents a profitable position from consuming assets already reserved for another accounting domain.

## Invariants

- Fee configuration is Governance/Registry-owner controlled.
- Fee and Insurance-share inputs are bounded to BPS.
- Collected fees cannot exceed the trader's available balance.
- Entry failure after attempted fee collection rolls back atomically.
- Partial reduction fees use only the reduced notional.
- Full close uses the same canonical reduction/fee path.
- User accounting decreases by exactly the collected fee.
- Insurance + Treasury reserve increase equals the collected fee.
- Funding pool remains segregated.
- Positive PnL cannot consume Funding/Insurance/Treasury reserves.
- Futures fee accounting has no dependency on Lending, LQC Staking, or DEX Router fee accounting.

## Deliberately deferred

- Insurance reserve spending / liquidation deficit coverage;
- explicit residual bad debt;
- partial liquidation;
- bounded ADL;
- final Treasury withdrawal/role policy;
- production fee economics.

No Testnet transaction, deployment, market activation, signature, or user-fund action is authorized.

`activationAuthorized: false`

## Verification method

This substep follows `docs/INCREMENTAL_VERIFICATION_POLICY.md`.

The PR is gated by the shared **LQC Futures Focused CI** only. Historical completed Master workflows are not replayed automatically. Broad full regression remains mandatory at the 7/5-7 integration gate and later release/security gates.

## Next

**7/5-4 Futures-only Insurance Fund / residual bad debt accounting**
