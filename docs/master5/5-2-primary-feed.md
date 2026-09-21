# Master 5/2 — Primary Feed Gate

Status: verification-only

## Purpose

Freeze the minimum validity requirements for the configured primary feed before Reference Feed, TWAP, freshness/deviation and circuit-breaker stages are completed.

## Existing implementation reused

`LQCOracleManager` reads the configured primary through `ILQCPriceFeed` and already rejects:
- non-positive answers;
- zero or future timestamps;
- incomplete rounds;
- stale data beyond configured maxAge;
- feed decimals above the supported configuration ceiling.

Prices are normalized to 1e18 before economic use.

## Required boundary

1. Primary feed address is configuration, not a hard-coded BSC Core dependency.
2. Primary and secondary addresses must be distinct and non-zero.
3. Primary feed decimals must be supported before configuration is accepted.
4. A primary read must fail closed on invalid round evidence.
5. Primary validity does not by itself authorize borrowing, liquidation, Futures trading, deployment or production activation.
6. Module-specific Oracle managers/adapters remain independent.

No on-chain state is changed by this verification gate.

`activationAuthorized: false`
