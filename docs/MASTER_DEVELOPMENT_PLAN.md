# LQC Master Development Plan

Status: Architecture Freeze working baseline  
Master rule: this document defines the current dependency order. Historical stage labels and PR titles remain audit evidence but do not override this plan.

## Project objective

LQC is a Liquidity & Execution Ecosystem. LQC Flow is the user-facing entry point; Router 2.0 selects and proves execution; Vault/Liquidity provides accounting infrastructure; Oracle provides validated pricing; Lending/Earn and Futures provide financial utility; Intent/Internal Solver and Solver Network coordinate execution; Settlement/Execution Verification authenticates outcomes; Risk/Treasury/Governance controls the system.

## Master dependency order

1. Architecture Freeze
2. LQC Flow
3. Router 2.0 / Best Execution
4. Vault / Liquidity
5. Oracle Foundation
6. Lending / Earn / LQC Staking
7. Futures
8. Intent / Internal Solver
9. Solver Network
10. Settlement / Execution Verification
11. Unified Risk / Treasury / Governance
12. Full BSC Testnet Integration
13. Security / Independent Audit
14. Token / CEX Readiness
15. Capped Public Pilot / LQC Mainnet Path

## Stage 6 — Lending / Earn / LQC Staking

Existing Lending contracts and tests are reused. Staking is modular and does not share Lending Core accounting.

- 6/1 Market Registry
- 6/2 Interest Rate Model
- 6/3 Interest Index
- 6/4 Lending Core
- 6/5 Collateral
- 6/6 Supply
- 6/7 Borrow
- 6/8 Repay
- 6/9 Health Factor
- 6/10 Liquidation
- 6/11 Bad Debt / Reserve
- 6/12 Clean/validated Testnet deployment decision based on Architecture Freeze evidence
- 6/13 Lending Core E2E
- 6/14 Supply Earn
- 6/15 LQC Staking Vault
- 6/16 Reward Accounting / Claim
- 6/17 Lock / Cooldown / Unstake
- 6/18 Staking Governance / Emergency Controls
- 6/19 Lending + Earn + Staking E2E

### Stage 6 architecture rules

- Liquidation is Health-Factor based, not fixed-price-decline based.
- Protocol Maximum-LTV hard ceiling is 50%.
- Initial controlled BSC pilot candidate is 50% Maximum LTV / 70% liquidation threshold / 5% maximum liquidation bonus, subject to asset-specific tightening, simulation, audit, and governance.
- Supply Earn derives variable yield from actual borrower interest; no fixed APY is guaranteed.
- LQC Staking is a separate vault/accounting domain and is not silently rehypothecated into Lending.
- The canonical LQC Staking Vault is developed once in Master 6 and is designed for later reuse by approved ecosystem modules rather than creating duplicate staking custody domains.
- Future Launchpad integration consumes a reviewed read-only/versioned staking interface for bounded eligibility data such as staked balance, lock duration, staking weight, or snapshot state; Launchpad must not custody staking principal or mutate staking reward accounting.
- Staking rewards must reconcile to approved fixed-supply tokenomics and a disclosed bounded reward source.
- Development timing: 6/15-6/19 completes the canonical Staking Vault and its E2E first; Launchpad-specific staking integration is deferred until the Launchpad workstream is active and the staking interface is stable/reviewed.
- Safety/Insurance Staking is post-pilot scope and requires separate simulation, audit, legal review, disclosure, and governance.

## Evidence state model

Every capability is tracked independently through:

IMPLEMENTED -> UNIT TESTED -> INTEGRATION TESTED -> TESTNET VERIFIED -> SECURITY VERIFIED -> RELEASE READY

A repository test PASS does not imply Testnet, Audit, CEX, or production readiness.

## CEX consistency gate

Before CEX due diligence, the whitepaper, README, contracts/configuration, testnet evidence, website, tokenomics, vesting, circulating-supply methodology, and exchange evidence package must be mutually consistent. Every technical artifact must be pinned to a commit and every on-chain claim to a network and verifiable transaction/block evidence.

## Current position

MASTER: **6/16 — Lending / Earn / LQC Staking**  
COMPLETED IN CURRENT RESTART PATH: **6/13 Lending Core repository E2E PASS; 6/14 Supply Earn reuse gate PASS; 6/15 LQC Staking Vault PASS**  
CURRENT EXECUTABLE: **6/16 Reward Accounting / Claim**  
ON-CHAIN BOUNDARY: the verified 10/10 clean BSC Testnet Lending deployment is preserved, but Governance configuration, market enablement, new Testnet transactions, and production activation each remain separately gated and are not implied by repository PASS.  
WORKING RULE: verified earlier Master stages are reused; only evidence gaps or real implementation gaps are developed.


## Mainnet portability and module-isolation rule

LQC is developed on BSC first, but the Core architecture must remain portable to a future independent LQC Mainnet.

- Futures, Lending/Earn, Router, Vault, Intent/Solver, Settlement, Oracle, Risk, Treasury, and Governance are one ecosystem but remain independently testable failure domains.
- Futures must not embed or mutate Lending Core accounting, and Lending must not depend on Futures state. Shared functionality is consumed through reviewed interfaces.
- Shared Oracle, Router, Vault, Risk, Treasury, and Governance capabilities use explicit interfaces and versioned integration gates.
- A module-specific emergency pause must not automatically halt unrelated healthy modules. A validated system-wide dependency failure may trigger coordinated controls through Risk/Governance.
- Chain IDs, RPC URLs, gas assets, DEX endpoints, oracle addresses, bridge providers, and deployment addresses must be configuration/registry inputs rather than universal Core assumptions.
- BSC-specific integrations such as PancakeSwap remain behind protocol adapters.
- Core accounting and execution logic must remain chain-neutral where technically practical so it can be reused on an LQC Mainnet.
- Cross-chain expansion follows Intent + Solver + Settlement + reviewed Bridge Adapter Registry rather than embedding one proprietary bridge into LQC Core.
- Mainnet migration is phased: BSC validation -> capped pilot -> LQC Mainnet testnet -> audited parallel BSC/LQC operation -> governance-approved migration.
- BSC may remain an active liquidity domain after LQC Mainnet launch; Mainnet expansion does not require abandoning BSC.
- Every new Core change must include a portability review: chain-specific dependency, interface boundary, configuration source, migration impact, and regression scope.

Target architecture:

LQC Flow -> Router 2.0 / Best Execution -> Vault / Liquidity -> Lending/Earn + Futures -> Intent/Internal Solver -> Solver Network -> Settlement/Verification -> Oracle/Risk/Treasury/Governance, with chain-specific dependencies isolated behind adapters/configuration.
