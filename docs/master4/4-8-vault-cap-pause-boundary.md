# Master 4/8 — Vault Capacity / Pause Boundary Gate

Status: verification-only
Base: 11fef60fe1efa82a17513ffde184931e327f24fe

## Purpose

Freeze capacity and pause controls so liquidity growth cannot bypass Vault accounting or emergency boundaries.

## Rules

1. Deposits cannot exceed `depositCap`.
2. Deposit cap cannot be lowered below currently accounted assets.
3. Strategy allocation cannot exceed `strategyCap`.
4. Strategy cap cannot be lowered below outstanding strategy debt.
5. Deposit pause blocks new deposits.
6. Allocation pause blocks new strategy allocations.
7. Pause admin may stop operations but only owner may resume.
8. Resume requires solvency/full backing.
9. Router/Futures/Lending/Intent cannot alter caps or resume Vault operations.

`activationAuthorized: false`
