# Master 3/4 — Router Shared-Interface Isolation Gate

Status: verification gate
Base: 7e437f5a9295054565110f9fef9542692eeacc88

## Goal

Verify that Router 2.0 can be consumed across the LQC ecosystem without becoming the owner of module-specific accounting or lifecycle state.

## Allowed shared responsibilities

Router may expose reviewed interfaces for:
- quote and route discovery;
- gas-aware Best Execution;
- split-route planning;
- adapter execution;
- proof verification / proof-bound execution;
- registry and risk-policy reads required for execution.

## Forbidden coupling

Router Core must not own or mutate:
- Futures positions, leverage, margin, funding, liquidation state;
- Lending debt, collateral, interest indexes, health factor or liquidation accounting;
- LQC staking shares, reward debt, cooldown or unstake state;
- Intent lifecycle/escrow accounting beyond narrow execution interfaces;
- Settlement finality or cross-chain bridge state.

Shared Oracle/Risk/Treasury/Governance capabilities must be consumed through explicit reviewed interfaces rather than copied state.

## Optimization rule

A later module may integrate with Router before its nominal Master stage when doing so removes duplicate execution logic or prevents rework, provided accounting/failure domains remain isolated and the integration has a dedicated regression gate.

## Exit

3/4 exits with an automated source-boundary audit plus focused integration regression proving no forbidden module-state ownership has entered Router Core.

`activationAuthorized: false`
