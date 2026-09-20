# Master 3/5 — Adapter / Registry Boundary Gate

Status: verification gate
Base: bc7dde21b0bc04dbb663aaa6d499df99a0e310ab

## Goal

Keep Router 2.0 Core stable while DEX venues, chains and liquidity domains change.

## Rules

- ExecutionRouter consumes DEX venues through Registry-selected adapters.
- Quote/Best Execution logic must not call Pancake/venue contracts directly.
- Adapter enable/disable and identity come from Registry/risk configuration.
- Route execution must fail closed when adapter identity changes between quote/proof and execution.
- Venue-specific fee tiers, pool paths, router/factory/quoter addresses and calldata encoding stay inside adapters/configuration.
- Adding a future LQC Mainnet DEX must not require rewriting Router Best Execution semantics.
- No adapter may gain authority over Futures positions, Lending debt/collateral, Staking balances or Settlement finality.

## Exit

3/5 exits with automated source-boundary checks and regression evidence that disabled/drifted adapters fail closed while valid registered adapters remain executable.

`activationAuthorized: false`
