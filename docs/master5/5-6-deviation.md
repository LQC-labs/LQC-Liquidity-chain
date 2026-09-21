# Master 5/6 — Oracle Deviation Gate

Status: verification-only

## Purpose

Freeze independent-feed deviation protection before the Circuit Breaker and Oracle E2E completion stages.

## Existing implementation reused

Lending `LQCOracleManager` compares the validated primary and secondary/reference feeds after normalization. It computes conservative collateral/debt prices and rejects the read when the spread exceeds the asset-configured `maxDeviationBps`.

Configuration is bounded: deviation must be non-zero and cannot exceed `MAX_DEVIATION_BPS = 2000` (20%). This is a protocol configuration ceiling, not a recommendation that every asset use 20%.

## Required boundary

1. Deviation is evaluated only after both feeds pass validity/freshness checks.
2. Comparison operates on normalized prices.
3. The configured deviation threshold is non-zero and bounded by the protocol ceiling.
4. Excessive deviation fails closed; it cannot silently fall back to one feed.
5. Asset-specific governance may choose a tighter threshold.
6. Deviation failure does not merge Lending/Futures failure domains.
7. This gate does not authorize deployment, oracle activation, borrowing, liquidation, Futures trading or production use.

`activationAuthorized: false`
