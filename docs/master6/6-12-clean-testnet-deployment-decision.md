# Master 6/12 — Clean BSC Testnet Deployment Decision

Status: **verification / deployment-decision gate**
Network: **BSC Testnet (chainId 97)**

## Purpose

Decide whether the historical Lending testnet deployment can be credited as the current Master 6 deployment baseline after the 6/1–6/11 reconciliation and hardening work.

## Historical evidence found

The repository contains valid historical BSC Testnet evidence for:

- Stage 0: four test feeds and finalized Lending configuration;
- Stage 1: `LQCOracleManager` and `LQCInterestRateModel` deployment verification;
- Stage 2: `LQCLendingMarketRegistry` and `LQCLendingInterestIndex` deployment verification;
- Stage 3: a deployed `LQCLendingCore` later referenced by the Stage 4 binding review;
- Stage 4 preparation: Interest Index → Core binding, market configuration, Liquidation Engine deployment and Core binding plan.

These records remain historical evidence and MUST NOT be deleted or rewritten.

## Current-source change evidence

The historical Core/Registry deployment predates the current Master 6 hardening baseline.

Current `main` includes later contract changes including:

- 6/6 Supply Cap semantic correction in Lending Core / Market Registry;
- 6/8 paused-repayment safety change in Market Registry;
- 6/11 reserve-first bad-debt recovery and reserve-withdrawal protection in Lending Core.

Therefore the historical Stage 2/3 deployment cannot by itself be credited as the current clean Master 6 deployment.

## 6/12 decision

**FRESH_VALIDATION_REQUIRED**

### Mandatory fresh deployment

The following contracts have changed after the historical deployment evidence and must be deployed from the current pinned Master 6 source baseline:

1. `LQCLendingMarketRegistry`
2. `LQCLendingCore`

### Reuse only after cryptographic/runtime revalidation

The following historical contracts may be reused only if current compiled runtime bytecode, constructor/binding assumptions, ownership and live chain state are all proven identical/compatible:

1. `LQCOracleManager`
2. `LQCInterestRateModel`
3. `LQCLendingInterestIndex`

If any proof is missing or mismatched, redeploy that component.

### Required new deployment

`LQCLiquidationEngine` must have an explicit current deployment address bound to the current Core. A historical preparation record or predicted address is not deployment evidence.

## Clean baseline completion conditions

6/12 is not PASS until one evidence package proves all of the following against one pinned source commit:

1. chainId = 97;
2. current contract creation/runtime bytecode digests;
3. final addresses for Oracle Manager, Rate Model, Market Registry, Interest Index, Lending Core and Liquidation Engine;
4. Governance / Guardian ownership bindings;
5. Market Registry → Oracle binding;
6. Interest Index → Rate Model binding;
7. Interest Index → current Lending Core binding;
8. Lending Core → Market Registry / Interest Index binding;
9. Lending Core → Liquidation Engine binding;
10. 50% max LTV / 70% liquidation threshold / 5% max liquidation bonus;
11. supply / borrow cap configuration;
12. market remains disabled until the explicit 6/13 Lending E2E activation step;
13. every deployment/config transaction receipt is captured with block number/hash and confirmation evidence.

Historical evidence may be referenced, but it cannot substitute for current evidence where the implementation or binding changed.

No transaction is authorized by this decision gate.

`activationAuthorized: false`
