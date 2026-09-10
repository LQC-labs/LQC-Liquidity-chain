# LQC Development Sequence

Status: **approved and fixed execution order**

This is the official dependency-ordered development sequence for LQC. It prioritizes development speed, reuse, security, verifiable launch evidence, and future LQC mainnet expansion. UXUY-inspired convenience is adopted selectively while LQC retains its independent Multi-DEX Router, Vault, Lending, Cross-chain, and liquidity-infrastructure purpose.

## Official 12-stage sequence

| Order | Workstream | Required exit evidence |
|---:|---|---|
| 1 | Router, Vault, Risk, and adapter integration security | Integrated invariants, exposure/loss/cap enforcement, emergency controls, atomic rollback, and zero-retained-funds tests |
| 2 | BSC testnet deployment and real Swap validation | Published chain-97 addresses, verified source, ownership validation, route probes, smoke swaps, and monitoring report |
| 3 | Approved DEX connections and liquidity validation | Reviewed LQC Flow and PancakeSwap V2/V3 routes, bounded liquidity, measurable quotes, slippage, gas, and execution results |
| 4 | Mobile UI, multi-wallet, and one-click trading | Provider-neutral wallet choice, safe reconnect, route/cost/risk disclosure, fallback guidance, and mobile validation |
| 5 | Gasless Paymaster or signed-relay testnet integration | User signatures, policy authorization, quotas, gas caps, protocol budget, oracle checks, abuse controls, and emergency pause |
| 6 | Independent security audit and remediation | Pinned audit scope and commit, findings, fixes, auditor retest, and known-issues disclosure |
| 7 | Capped public pilot | Multisig, timelock, monitoring, incident response, approved limits, limited liquidity, and limited TVL |
| 8 | LQC token, vesting, and listing evidence | User-approved issuance, verified token/vesting contracts, circulation proof, legal/KYB, and market-integrity package |
| 9 | Lending module | Economic simulation, validated oracle/TWAP, health factor, liquidation, debt caps, bad-debt controls, and separate audit |
| 10 | Cross-chain module | Authenticated messaging, replay protection, rate limits, canonical assets, supply reconciliation, and separate audit |
| 11 | Mainnet-compatible architecture validation | Chain-neutral configuration, portable Router/Vault/Lending interfaces, gas-token model, validator/staking boundaries, and migration tests |
| 12 | Independent LQC mainnet development | Consensus and validator design, genesis and supply controls, testnet, audits, bridge migration, operations, and phased launch approval |

## Current position

Stage 1 repository evidence has a reproducible exit gate. Stage 2 preparation is active, while live
deployment remains blocked until reviewed BSC testnet Governance, Risk, Guardian, Treasury, and
deployer addresses are supplied and pass on-chain validation. Gasless Policy V1 is an isolated safety
foundation; actual sponsorship integration remains Stage 5 and must not bypass Stages 2-4.

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

## Mainnet portability requirements

- EVM-compatible contracts remain chain-neutral unless a reviewed chain-specific adapter is required.
- BSC-specific addresses and parameters must never be embedded as universal protocol assumptions.
- LQC supply across BSC, bridges, and a future mainnet must reconcile without duplicate or unexplained issuance.
- Bridge, validator, staking, gas-token, and consensus controls require separate design and audit.
- Mainnet development begins only after the BSC DEX, audit, and capped-pilot evidence demonstrate stable operation.

## Immediate next milestone

Complete Stage 1 Router-Vault-Risk-Adapter integration evidence. Then prepare Stage 2 without deploying until reviewed BSC testnet governance, risk-admin, guardian, treasury, and deployment addresses are supplied.

Run the repository-level Stage 1 exit gate from `dex/` with `npm run gate:stage1`. The gate fails
closed unless browser syntax checks, Solidity compilation, the complete contract/security suite, and
the Router SDK coverage threshold all pass. Passing this gate confirms repository evidence only; it
does not authorize deployment or replace the reviewed addresses and operational evidence required by
Stage 2.
