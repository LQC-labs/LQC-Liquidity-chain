# Master 4/5 — Vault Accounting Invariant Gate

Status: verification-only
Base: ad4d6ce86e999fbf83f3c9c5699d3788f69695d6

## Purpose

Freeze the core Vault accounting invariants after the 4/3 and 4/4 interface extensions, before any broader liquidity integration.

## Required invariants

1. `accountedAssets >= strategyDebt`.
2. `accountedIdleAssets = accountedAssets - strategyDebt`.
3. Advertised `availableLiquidity = min(actualIdle, accountedIdleAssets)`.
4. Unsolicited donations cannot increase accounted assets or advertised liquidity above accounted idle.
5. Strategy allocation changes idle/debt composition but not total accounted assets.
6. Recognized strategy loss reduces both strategy debt and accounted assets consistently.
7. Withdrawals cannot exceed accounted and actual idle liquidity.
8. Futures, Lending and Intent state cannot become Vault accounting inputs.

This gate does not authorize deposits, withdrawals, allocations, deployments, or production activation.

`activationAuthorized: false`
