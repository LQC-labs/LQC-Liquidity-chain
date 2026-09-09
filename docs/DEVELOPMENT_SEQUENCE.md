# LQC Development Sequence

Status: **approved execution order**

This sequence prioritizes a reproducible DEX launch, measurable liquidity, security evidence, and user experience. UXUY-inspired convenience is adopted only where it strengthens LQC's independent Multi-DEX Router, Vault, Lending, and Cross-chain liquidity infrastructure.

## Delivery gates

| Order | Workstream | Required exit evidence |
|---:|---|---|
| 1 | Repository baseline and CI | Reproducible build, locked dependencies, passing tests, explicit implemented/planned status |
| 2 | Router, risk, Vault, and adapter hardening | Integrated invariants, loss/cap enforcement, emergency controls, zero-retained-funds checks |
| 3 | Controlled BSC testnet deployment | Published addresses, verified source, ownership validation, route probes, smoke swaps, monitoring report |
| 4 | Reviewed DEX integrations and test liquidity | Approved Pancake V2/V3 plus LQC Flow routes, bounded liquidity, measurable quotes and execution |
| 5 | User experience and Gasless testnet integration | Multi-wallet flow, preflight guidance, fallback routes, reviewed paymaster/relay, quotas and sponsorship budget |
| 6 | Independent security review | Pinned audit scope, findings, remediation, retest, known-issues disclosure |
| 7 | Capped public pilot | Multisig, timelock, oracle, incident response, caps, live monitoring and limited TVL |
| 8 | Token and listing evidence | User-approved issuance, verified token/vesting contracts, circulation proof, legal/KYB and market-integrity package |
| 9 | Lending module | Economic simulation, oracle/TWAP, health factor, liquidation, bad-debt controls, separate audit |
| 10 | Cross-chain module | Message authentication, replay protection, rate limits, supply reconciliation, separate audit |
| 11 | Measured expansion | Additional DEXs/chains, staking or other utility only after reliability and legal/security approval |

## Current position

Orders 1 and most foundations in Order 2 are implemented in the repository. Gasless policy V1 is also implemented early as an isolated safety foundation, but the actual paymaster/relay remains blocked until the controlled BSC testnet stack in Orders 3-4 is verified.

## Mandatory rules

1. A failed CI or security test blocks the next dependent step.
2. Repository code does not equal deployment, audit, liquidity, partnership, or production evidence.
3. No mainnet funds are used before independent audit and capped-pilot approval.
4. New DEXs, tokens, routes, or limits require explicit review and configuration evidence.
5. UX simplification must not hide fees, slippage, price impact, sponsorship conditions, or material risk.
6. Gasless never removes the user's signature requirement or makes LQC custodial.
7. Lending and Cross-chain remain separate security scopes and do not delay the initial BSC DEX MVP.
8. Token issuance remains a user/governance decision and is not performed automatically by development tooling.

## Immediate next milestone

Complete Order 2 integration evidence, then prepare Order 3 without deploying until reviewed BSC testnet governance, risk-admin, guardian, treasury, and deployment addresses are supplied.
