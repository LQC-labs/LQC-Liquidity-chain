# Master 6/2 — Lending Interest Rate Model Reuse Audit

Status: verification-only

## Purpose

Audit the existing bounded utilization-based interest model before adding new rate logic.

## Existing implementation reused

`LQCInterestRateModel` already provides:

- per-market governed rate configuration;
- kinked utilization curve using base APR, slope1 and slope2;
- bounded optimal utilization between 50% and 95%;
- protocol-wide peak borrow APR ceiling of 20,000 bps;
- reserve factor ceiling of 3,000 bps;
- borrow and supply rates returned in per-second RAY units;
- supply rate derived from borrow rate × utilization × (1 - reserve factor);
- invalid liquidity rejection when borrow exceeds total liquidity;
- guardian disable / owner re-enable boundary;
- two-step ownership transfer.

## Reuse decision

The current model is the Master 6/2 baseline and MUST be reused unless a demonstrated economic or security gap requires extension.

The model does not guarantee a fixed APY. Supplier yield remains utilization-dependent and is derived from actual borrower interest.

No deployment, market activation, rate activation or production use is authorized by this audit.

`activationAuthorized: false`
