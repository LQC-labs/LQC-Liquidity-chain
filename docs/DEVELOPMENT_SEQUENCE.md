# LQC Development Sequence

Status: **approved and fixed execution order**

This is the official dependency-ordered development sequence for LQC. It prioritizes development speed, reuse, security, verifiable launch evidence, and future LQC mainnet expansion. UXUY-inspired convenience is adopted selectively while LQC retains its independent Multi-DEX Router, Vault, Lending, Cross-chain, and liquidity-infrastructure purpose.

## Official 12-stage sequence

| Order | Workstream | Required exit evidence |
|---:|---|---|
| 1 | Router, Vault, Risk, and adapter integration security | Integrated invariants, exposure/loss/cap enforcement, emergency controls, atomic rollback, and zero-retained-funds tests |
| 2 | BSC testnet deployment and real Swap validation | Published chain-97 addresses, verified source, ownership validation, route probes, smoke swaps, and monitoring report |
| 3 | Approved DEX connections, liquidity quality, and Best Execution Proof | Reviewed LQC Flow and PancakeSwap V2/V3 routes, bounded liquidity, comparable net-output quotes, settlement-bound proof, slippage, gas, and execution results |
| 4 | Mobile UI, multi-wallet, one-click trading, and Router SDK/API | Provider-neutral wallet choice, safe reconnect, route/cost/risk disclosure, fallback guidance, mobile validation, read-only quote API, execution SDK, authentication, rate limits, and integration documentation |
| 5 | Gasless Paymaster or signed-relay testnet integration | User signatures, policy authorization, quotas, gas caps, protocol budget, oracle checks, abuse controls, and emergency pause |
| 6 | Independent security audit and remediation | Pinned audit scope and commit, findings, fixes, auditor retest, and known-issues disclosure |
| 7 | Capped public pilot | Multisig, timelock, monitoring, incident response, approved limits, limited liquidity, and limited TVL |
| 8 | LQC token, vesting, and listing evidence | User-approved issuance, verified token/vesting contracts, circulation proof, legal/KYB, and market-integrity package |
| 9 | Lending module | Economic simulation, validated oracle/TWAP, health factor, liquidation, debt caps, bad-debt controls, and separate audit |
| 10 | Cross-chain module | Authenticated messaging, replay protection, rate limits, canonical assets, supply reconciliation, and separate audit |
| 11 | Mainnet-compatible architecture validation | Chain-neutral configuration, portable Router/Vault/Lending interfaces, gas-token model, validator/staking boundaries, and migration tests |
| 12 | Independent LQC mainnet development | Consensus and validator design, genesis and supply controls, testnet, audits, bridge migration, operations, and phased launch approval |

## Current position

Stages 1-3 have repository evidence and real BSC testnet evidence for the DEX, Router 2.0, reviewed
Safe roles, LQC Flow execution, and proof-bound execution. Some older operational records still need
receipt, event, balance, and final-state reconciliation into one canonical evidence package.

Intent V1 and Composite Intent are a separate expansion scope. Their contracts and local tooling are
substantially implemented, but fixture-tested readiness packages are not real deployment evidence.
No Intent V1 or Composite deployment is treated as BSC testnet complete until the actual Bond decision,
deployment transactions, Safe bindings, Intent submission, solver quote, execution receipt, and final
state are verified. The detailed current critical path is maintained in
`dex/docs/OPTIMIZED_DEVELOPMENT_ROADMAP_KO.md`.

## Efficiency rules

1. Complete and verify each dependency before advancing the dependent stage.
2. Run independent UI, documentation, and non-conflicting test work in parallel where safe.
3. Reuse chain-neutral interfaces and keep chain IDs, RPCs, gas assets, oracle addresses, DEX addresses, and limits in validated configuration.
4. Do not duplicate Router, risk, accounting, or access-control logic between BSC and future LQC mainnet modules.
5. A failed CI, invariant, deployment validation, or security review blocks the next dependent stage.
6. Keep implementation, deployment, audit, liquidity, partnership, and production claims clearly separated.
7. Never use mainnet funds before independent audit and capped-pilot approval.
8. UX simplification must not hide fees, slippage, price impact, Gasless eligibility, user cost, or material risk.
9. Gasless always requires the user's authorization and must remain non-custodial.
10. Lending, Cross-chain, and mainnet are separate security scopes and must not delay the initial BSC DEX MVP.
11. Token issuance remains a user/governance decision and is not performed automatically by development tooling.
12. Every completed stage must leave reproducible code, tests, documentation, and GitHub evidence.

## Strategic execution requirements

LQC will compete as a verifiable global liquidity operating layer, not by copying a broad consumer wallet feature set. LQC Flow remains the direct user interface, while Router 2.0 and its SDK/API become the reusable infrastructure offered to wallets, DEXs, projects, exchanges, and market makers.

### Best Execution Proof acceptance criteria

- Compare gross output, pool/protocol fees, estimated gas, slippage, price impact, and final net output across every eligible route.
- Compare the best single route with an atomic split route and select split execution only when its net result is superior.
- Bind chain, block, token pair, amount, adapters, route data, minimum output, quote expiry, and selected result to a deterministic proof.
- Bind the proof to a successful canonical settlement and reject expired, failed, reorged, mismatched, or tampered evidence.
- Display estimated savings against the best rejected alternative without claiming guaranteed realized savings.

### Liquidity quality acceptance criteria

- Begin with a small set of approved BNB Chain venues and core pairs; depth and reliable execution take priority over integration count.
- Publish timestamped quote, slippage, price-impact, gas, failure-rate, and realized-output measurements for each active route.
- Require bounded pilot liquidity, approved market-making policy, route-specific caps, and incident-free observation before expansion.
- Disable a degraded route independently without interrupting healthy adapters.

### B2B Router SDK/API acceptance criteria

- Provide read-only multi-DEX quotes, selected-route evidence, transaction construction, and post-settlement verification.
- Use documented versioning, authentication, quotas, rate limits, request tracing, and deterministic error responses.
- Never receive, store, or transmit user private keys; execution remains user-authorized and non-custodial.
- Publish an integration guide, reference client, sandbox environment, service-status page, and compatibility tests.
- Define transparent routing/infrastructure fees before any commercial activation.

### Sequencing constraints

- Gasless improves access but cannot precede controlled routing, wallet, monitoring, and abuse-control evidence.
- Lending, Vault yield strategies, staking, perpetuals, RWA, and cross-chain expansion remain separately scoped and audited modules.
- Consumer feature breadth must not delay verified routing quality, real liquidity, security review, or B2B integration readiness.

## Mainnet portability requirements

- EVM-compatible contracts remain chain-neutral unless a reviewed chain-specific adapter is required.
- BSC-specific addresses and parameters must never be embedded as universal protocol assumptions.
- LQC supply across BSC, bridges, and a future mainnet must reconcile without duplicate or unexplained issuance.
- Bridge, validator, staking, gas-token, and consensus controls require separate design and audit.
- Mainnet development begins only after the BSC DEX, audit, and capped-pilot evidence demonstrate stable operation.

## Immediate next milestone

Consolidate the existing Router 2.0 BSC evidence, then execute the Intent V1 testnet pilot from Bond
selection through one verified same-chain Intent. In parallel, complete the Composite Coordinator and
its adversarial local tests without changing the deployed IntentHub interface.

Repository gates confirm local evidence only. Every wallet signature, Safe proposal, deployment, and
value-moving transaction remains an explicit operational approval boundary.
