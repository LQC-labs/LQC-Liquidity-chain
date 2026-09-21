# Master 5/3 — Reference Feed Gate

Status: verification-only

## Purpose

Freeze the independent reference-feed boundary used to challenge the Primary Feed before later deviation/circuit-breaker completion gates.

## Existing implementation reused

Lending `LQCOracleManager` already requires a distinct secondary/reference feed for every enabled asset. Both feeds pass the same round-integrity, timestamp, freshness and decimal normalization path. Economic valuation is conservative: collateral uses the lower validated price and debt uses the higher validated price.

Futures retains its independent reference-source semantics through its module-specific adapter. Master 5 does not merge mutable Lending and Futures Oracle configuration.

## Required boundary

1. Reference feed must be non-zero and distinct from Primary.
2. Reference feed must pass the same validity/read rules as Primary.
3. Reference and Primary prices are normalized before comparison/use.
4. Conservative Lending valuation uses lower price for collateral and higher price for debt.
5. Reference-source configuration remains governance-controlled and chain/provider portable.
6. Reference validation alone does not authorize deployment, borrowing, liquidation, Futures trading or production activation.

`activationAuthorized: false`
