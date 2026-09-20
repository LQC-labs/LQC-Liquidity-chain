# LQC Oracle Interface Boundary

Status: **Architecture Freeze G1 design decision**

## Decision

Lending and Futures remain separate accounting/failure domains and **do not share one mutable Oracle Manager contract**. They may consume the same independently reviewed underlying price-feed sources through module-specific adapters/managers.

This preserves module-specific risk semantics while allowing future BSC-to-LQC-Mainnet portability.

## Why the current contracts must remain distinct

### Lending

`LQCOracleManager` is solvency-oriented. It:
- requires primary and secondary feeds;
- fails closed on stale/invalid/incomplete data and excessive deviation;
- returns a conservative **lower collateral price** and **higher debt price**;
- supports owner + guardian disable controls;
- feeds Health-Factor, borrow, withdrawal and liquidation decisions.

### Futures

`ILQCFuturesOracle` exposes `getPrice(indexToken) -> (price, updatedAt)`.
`LQCAggregatorOracleAdapter` is mark/index-price oriented. It:
- normalizes an index feed to 1e18;
- validates heartbeat and round integrity;
- optionally compares an independent reference feed;
- exposes source timestamp to Futures risk logic;
- has independent ownership/configuration.

These semantics are intentionally different. Forcing both modules into one shared mutable manager would couple configuration, emergency behavior and upgrade risk.

## Approved boundary

Underlying feed source
→ chain/provider adapter
→ **module-specific Oracle adapter/manager**
→ module-specific Risk Engine

Lending path:
`ILQCPriceFeed → LQCOracleManager → LendingMarketRegistry / LendingCore`

Futures path:
`Aggregator-compatible feed → LQCAggregatorOracleAdapter (ILQCFuturesOracle) → Futures Market/Risk/Engine`

## Shared standards

Both paths must:
1. normalize economic prices to a documented scale;
2. validate positive price, timestamp, round completeness and freshness;
3. support independent/reference-source deviation protection where required;
4. fail closed when required evidence is invalid;
5. expose configuration through governance-controlled, reviewable state;
6. avoid hard-coded BSC feed addresses in Core contracts;
7. permit future LQC Mainnet feed adapters without rewriting Lending/Futures accounting;
8. maintain independent emergency disable/pause domains.

## Prohibited coupling

- Futures may not read or mutate Lending collateral/debt accounting.
- Lending may not depend on Futures positions, PnL, funding or insurance state.
- A Futures feed/config update must not silently change Lending risk parameters.
- A Lending asset disable must not automatically disable unrelated Futures markets.
- Shared underlying feed infrastructure must not create a single unreviewed administrative key controlling both financial modules.

## Coordinated system-wide response

A validated failure in a genuinely shared external dependency may trigger coordinated Risk/Governance action, but that action is explicit and role-controlled. It is not an implicit consequence of sharing one mutable Oracle contract.

## Mainnet portability

Feed addresses, heartbeat/max-age, deviation limits, and chain/provider details remain configuration/adapter concerns. Core Lending/Futures accounting consumes stable interfaces. A future LQC Mainnet may introduce new feed adapters while retaining the same module-level economic semantics.

## G1 exit decision

G1 is architecture-resolved when this boundary is accepted into the Master evidence set. Runtime implementation changes are not required merely to unify the current contracts; any future common library must contain stateless validation utilities only and must not merge module accounting or mutable configuration domains.
