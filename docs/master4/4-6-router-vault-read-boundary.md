# Master 4/6 — Router / Vault Read Boundary Gate

Status: verification-only
Base: 1e7cd09bd86c1b1c473acc15d8f1baa832fc129e

## Purpose

Define the only Vault surface Router-side liquidity planning may consume: the narrow read-only `ILQCVaultRead` interface.

## Rules

- Router planning may read asset identity, total/accounted assets, strategy debt, pause flags, insolvency state and available liquidity.
- Router contracts/adapters must not receive Vault mutation authority.
- Vault must not approve Router/DEX adapters as a side effect of read integration.
- Router execution must not change Vault principal, shares, strategy debt, or strategy balances unless a separately reviewed future liquidity-allocation interface is introduced.
- Futures/Lending/Intent state remains outside Vault accounting.
- Existing `vault-router-risk-integration.test.mjs` remains regression evidence for isolation.

No production activation or fund movement is authorized.

`activationAuthorized: false`
