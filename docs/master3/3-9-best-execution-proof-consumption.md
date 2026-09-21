# Master 3/9 — Best Execution Proof Consumption Gate

Status: implementation gate
Base: c066d44159c5eb3eaaba2112081f058351c4e5e3

## Purpose

Master 3/9 verifies that an execution request consumes exactly the immutable Master 3/8 proof it declares, without recomputing or silently substituting route identity.

## Rules

1. Require a successful 3/8 proof with `activationAuthorized: false`.
2. Recompute SHA-256 from the supplied canonical payload and require exact digest equality.
3. Require request route, chain ID, router address, registry version and quote expiry to equal the bound payload.
4. Reject expired proofs and any request carrying Futures, Lending or Intent execution state.
5. Reject any execution request that attempts to override candidates, route, adapter, domain or proof payload.
6. This gate is verification-only and never signs or broadcasts a transaction.

`activationAuthorized: false`
