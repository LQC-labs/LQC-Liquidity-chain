# Master 3/1 — Router 2.0 / Best Execution Reuse Audit

Status: evidence-first implementation gate
Base: 5dfb740974f1c9cd7ea3ce4abf6789353a46fc25

## Why this stage starts with reuse

The Master baseline names Router 2.0 / Best Execution as Stage 3, but development order is a dependency baseline rather than a prohibition on rational reordering. Existing Router 2.0 implementation, proof-bound execution evidence, risk gates, quote/readiness tooling, and Intent-to-Router integration must be reused where valid instead of rebuilt.

## 3/1 objectives

1. Inventory canonical Router 2.0 production components and adapters already present in main.
2. Map existing unit/integration/Testnet evidence to the current evidence-state model.
3. Separate reusable Router execution/proof logic from historical stage labels.
4. Identify only genuine gaps required for current LQC Flow, Vault, Oracle, Intent/Solver, Futures compatibility, and future LQC Mainnet portability.
5. Prevent duplicate Router contracts or parallel Best Execution truth sources.
6. Preserve chain-specific DEX integrations behind adapters/configuration.

## Optimization rule

Stage order may be changed when a documented dependency, safety, duplication, or delivery-time analysis shows that reordering is superior. Reordering must not weaken evidence gates or silently couple module accounting/state.

## Isolation rules

- Router may expose reviewed execution/quote/proof interfaces to DEX, Futures, Lending, Intent/Solver and later Settlement.
- Router must not own Futures positions, Lending debt, staking balances, or module-specific treasury accounting.
- Futures and Lending state cannot be used as Router execution truth.
- PancakeSwap/BSC assumptions remain adapter/configuration concerns.
- Core route/proof semantics must remain portable to a future LQC Mainnet.

## Exit criteria

3/1 exits only with a machine-readable reuse/gap matrix that classifies each Router capability as:
REUSE / REVALIDATE / GAP / DEFER,
with evidence references and no production activation authorization.

`activationAuthorized: false`
