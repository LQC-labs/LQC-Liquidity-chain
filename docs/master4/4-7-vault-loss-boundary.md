# Master 4/7 — Vault Strategy Loss Boundary Gate

Status: verification-only
Base: f6e0ac05dbfc9f6e8ca2eec78e7848256cab26b8

## Purpose

Freeze the bounded-loss and emergency-reconciliation rules around Vault strategy debt before any broader liquidity allocation work.

## Required safety rules

1. Normal recall loss is bounded by configured `maxLossBps`.
2. Configured normal loss cannot exceed `MAX_CONFIGURED_LOSS_BPS`.
3. Emergency loss override is owner-only and requires both deposits and allocations paused.
4. Emergency loss bound cannot exceed 100%.
5. Loss recognition reduces both strategy debt and accounted assets; it cannot create assets.
6. Strategy replacement is forbidden while strategy debt remains.
7. Resume paths require full backing.
8. Router, Futures, Lending and Intent cannot authorize or widen strategy loss.

This stage does not execute a recall or recognize a loss on-chain.

`activationAuthorized: false`
