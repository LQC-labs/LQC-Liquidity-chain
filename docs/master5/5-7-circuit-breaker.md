# Master 5/7 — Oracle Circuit Breaker Gate

Status: verification-only

## Purpose

Freeze the module-specific Oracle circuit-breaker boundary without creating one shared mutable Oracle authority across Lending and Futures.

## Existing implementation reused

### Lending

`LQCOracleManager` fails closed on invalid, stale, incomplete or excessively divergent dual-feed evidence. An owner or guardian may disable an asset; only the owner may re-enable it.

### Futures

`LQCAggregatorOracleAdapter` supports an independently configured reference-feed circuit breaker and reverts on excessive price deviation. `LQCFuturesMarketRegistry` provides an explicit owner-controlled market active flag for market-level shutdown.

The application-level Futures `priceCircuitBreaker` is supplemental UI/service protection only. It is not treated as production governance authority.

## Required boundary

1. Oracle evidence failure must fail closed.
2. Lending and Futures retain independent pause/disable domains.
3. Emergency disable authority must not silently grant re-enable authority.
4. A shared underlying feed failure may justify coordinated governance action, but one module's breaker must not implicitly mutate the other module's state.
5. Production controls must be explicit contract/configuration state; application-layer guards are supplemental only.
6. No circuit-breaker event authorizes deployment, borrowing, liquidation, Futures trading or production activation by itself.

`activationAuthorized: false`
