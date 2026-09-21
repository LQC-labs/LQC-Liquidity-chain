# Master 5/5 — Oracle Freshness Gate

Status: verification-only

## Purpose

Freeze freshness and timestamp validity as mandatory Oracle Foundation evidence before deviation and circuit-breaker completion.

## Existing implementation reused

Lending `LQCOracleManager` rejects a feed read when:
- `updatedAt == 0`;
- `updatedAt > block.timestamp`;
- `block.timestamp - updatedAt > maxAge`;
- the round is incomplete.

`maxAge` is governed per asset and constrained at configuration time to 60 seconds through 2 days.

Futures has its own heartbeat/freshness semantics and remains an independent failure domain.

## Required boundary

1. No economic price is accepted without a valid source timestamp.
2. Future timestamps fail closed.
3. Stale data beyond the configured age fails closed.
4. Freshness configuration is explicit, governed and asset/module specific.
5. Freshness failure must not be bypassed merely because another module remains healthy.
6. This repository gate does not authorize deployment, oracle activation, borrowing, liquidation, Futures trading or production use.

`activationAuthorized: false`
