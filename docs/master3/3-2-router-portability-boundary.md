# Master 3/2 — Router Portability and Configuration Boundary

Status: implementation gate
Base: 7ad5140925e8a293d759fbb385537823d68fd44f

## Goal

Close the genuine Stage 3 portability gap without rebuilding Router 2.0.

Router Core route selection, proof semantics and execution orchestration must remain chain-neutral where practical. BSC/Pancake-specific values belong to adapters, registries or deployment configuration.

## Required boundaries

- chainId is domain/configuration input, not a universal Router constant;
- RPC URLs never belong in Router Core contracts;
- WBNB/native gas asset addresses are deployment configuration;
- Pancake V2/V3 router/factory/quoter/pool assumptions stay inside reviewed adapters/config;
- token and pool allowlists are registry/risk configuration;
- Oracle addresses are consumed through reviewed Oracle interfaces/registries;
- future LQC Mainnet may supply different adapters and native gas configuration without rewriting Best Execution semantics;
- proof domain separation must bind the actual chain/deployment domain and reject cross-domain replay.

## Non-goals

No BSC Testnet transaction, deployment, upgrade, liquidity movement, Futures/Lending state change, or production activation.

## Exit

3/2 exits with an automated audit that detects forbidden chain-specific Core assumptions and a documented adapter/configuration map.

`activationAuthorized: false`
