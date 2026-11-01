# LQC Canonical Whitepaper Source — Architecture Freeze

Version: Architecture Freeze working source  
Status: **canonical drafting source — not yet the released PDF**  
Project: Liquidity Chain (LQC) / MMXlabs&LQC

This source consolidates approved architecture decisions before regenerating the official whitepaper PDF. The existing PDF remains preserved until this source passes repository, testnet, tokenomics, security-status, and CEX-evidence reconciliation.

## 1. Executive Summary

LQC is a **Liquidity & Execution Ecosystem** designed to connect fragmented liquidity and execution across decentralized markets and blockchain ecosystems.

The target stack is:

**LQC Flow → Router 2.0 / Best Execution → Vault / Liquidity → Oracle Foundation → Lending / Earn / LQC Staking + Futures → Intent / Internal Solver → Solver Network → Settlement / Execution Verification → Unified Risk / Treasury / Governance → Full BSC Integration → Security / Audit → CEX Readiness → Public Pilot → future LQC Mainnet**

LQC is developed BSC-first while keeping Core accounting and execution logic portable toward a future independent LQC Mainnet.

## 2. Architecture Principles

### 2.1 One ecosystem, isolated failure domains

Lending, Futures, Router, Vault, Intent/Solver, Settlement, Oracle, Risk, Treasury, and Governance form one ecosystem but remain independently testable accounting and failure domains. Futures does not mutate Lending Core accounting and Lending does not depend on Futures state. Shared functionality is consumed through reviewed interfaces and integration gates.

### 2.2 Chain-neutral Core and adapters

Chain IDs, RPC endpoints, gas assets, DEX addresses, oracle addresses, bridge providers, and deployment addresses are configuration/registry inputs rather than universal Core assumptions. BSC-specific integrations such as PancakeSwap remain behind adapters.

### 2.3 Mainnet portability

Migration is phased:

**BSC validation → capped pilot → LQC Mainnet testnet → audited BSC/LQC parallel operation → governance-approved migration**

BSC may remain an active liquidity domain after a future LQC Mainnet launch.

## 3. LQC Flow and Router 2.0

LQC Flow is the direct non-custodial user-facing execution application. Router 2.0 evaluates approved liquidity venues and may compare price, liquidity, fees, gas, slippage, price impact, minimum output, deadline, and final net output.

The Router architecture includes DEX Registry, approved adapters, Quote Router, Execution Router, Split Optimizer, Gas Cost Oracle, Risk Registry, emergency controls, Best Execution Proof, and proof-bound execution components.

Release credit requires current integration evidence; historical client/SDK proof enforcement alone is not sufficient for final on-chain proof-enforcement claims.

## 4. Vault and Liquidity

Vault infrastructure provides bounded deposit/withdraw accounting, share accounting, caps, strategy-adapter boundaries, recall/shutdown controls, and Router/Risk integration. Chain-specific strategies remain adapters rather than Core assumptions.

## 5. Oracle Foundation

Oracle infrastructure is shared through reviewed interfaces while each consuming module retains explicit risk boundaries. Lending fails closed on invalid, stale, incomplete, or excessively divergent prices. A shallow LQC pool is not sufficient as the sole Lending oracle.

The controlled Lending testnet configuration currently records a one-hour maximum staleness and 2% maximum primary/secondary deviation. These are pilot configuration values, not universal permanent parameters.

## 6. Lending Risk Engine

Liquidation is based on account solvency and **Health Factor**, not a fixed percentage decline in token price.

**Health Factor = (Collateral Value × Liquidation Threshold) / Debt Value**

- HF > 1: not liquidatable.
- HF = 1: liquidation boundary.
- HF < 1: liquidation may execute subject to protocol controls.

Protocol Maximum-LTV hard ceiling: **50%**.

Initial controlled BSC pilot candidate:
- Maximum LTV: **50%**
- Liquidation threshold: **70%**
- Maximum liquidation bonus: **5%**

These values are not universal for every collateral asset. Governance may configure stricter asset-specific parameters after volatility, liquidity, oracle-quality, and liquidation-depth review.

Partial liquidation is preferred. The current implementation caps one liquidation at up to 50% of outstanding debt. Residual debt after collateral exhaustion is recorded as bad debt and handled through explicit reserve, recapitalization, or bounded-loss controls.

## 7. Lending Supply Earn and LQC Staking

### 7.1 Supply Earn

Approved Lending suppliers may earn variable yield derived from actual borrower interest after utilization, reserve factor, losses, and applicable protocol parameters. No fixed or guaranteed APY is promised.

### 7.2 LQC Staking Vault

LQC Staking is a separate vault/accounting module, not an embedded Lending Core balance. Staked LQC is not silently rehypothecated into Lending and does not conceal Lending losses.

Staking includes explicit reward accounting/claim, lock, cooldown, unstake, emergency pause, and governance controls.

Token-denominated rewards must reconcile to the fixed LQC supply and an approved existing allocation. Protocol-revenue-funded rewards are separately accounted and are not guaranteed yield.

### 7.3 Shared Staking Utility for Lending/Earn and Future Launchpad

LQC uses one canonical Staking Vault rather than creating separate staking pools for Lending/Earn and Launchpad. The Staking Vault is developed first as part of the Lending/Earn stage, but it remains an independent Core utility that can later be consumed by other approved ecosystem modules.

For a future LQC Launchpad, staking principal remains in the canonical LQC Staking Vault. Launchpad contracts must not create a second staking custody domain merely to determine allocation eligibility. Instead, an approved read-only/versioned staking interface may expose bounded data such as staked balance, lock duration, staking weight, and snapshot state for Launchpad tier or allocation calculations.

Launchpad integration must not:
- transfer or rehypothecate staking principal;
- mutate Lending Core accounting;
- mutate staking reward accounting;
- treat Launchpad eligibility as an additional reward emission;
- bypass staking cooldown, withdrawal, governance, or emergency controls.

This design allows one LQC stake to provide multiple reviewed utilities over time, including staking rewards, future Launchpad eligibility, and potential governance utility, without requiring the user to lock the same LQC in multiple protocol-specific staking pools.

Development timing is dependency-based: the canonical Staking Vault, reward accounting, lock/cooldown, governance controls, and Lending/Earn/Staking E2E are completed first. Launchpad-specific staking integration is added only when the Launchpad workstream becomes active and after the staking interface is stable and reviewed.

### 7.4 Future Safety / Insurance Staking

Safety/Insurance Staking is post-pilot scope and requires separate economic simulation, slashing/loss rules, independent audit, legal review, user disclosure, and governance approval.

## 8. Futures / Perpetuals

Futures is integrated into the LQC ecosystem through reviewed Oracle, Vault/Risk, and execution interfaces while preserving its own accounting and failure domain.

Repository evidence includes Futures Registry, Vault, Oracle, Perp Engine, position/order/funding/leverage/liquidation/insurance/ADL/emergency-control test coverage and controlled BSC Testnet deployment/evidence. Production readiness and independent audit are not claimed.

## 9. Intent and Internal Solver

Users may express execution requirements as signed intents. The architecture includes IntentHub, replay/expiry controls, Source Escrow, Solver binding, Internal Solver, Router execution, and Execution Receipt.

Repository same-chain E2E evidence is distinct from production or cross-chain completion.

## 10. Solver Network

The planned/open Solver layer includes SolverRegistry, SolverBond, exposure/capacity controls, quote competition, risk-adjusted Best Execution, and reputation. Implemented foundations are retained, while missing official gates such as final QuoteManager/bond-policy requirements must be closed before completion credit.

## 11. Settlement and Cross-chain

LQC does **not** embed a proprietary bridge as its Core cross-chain architecture.

Cross-chain expansion follows:

**Intent → Solver Competition → Settlement → Execution Verification → reviewed Bridge Adapter Registry**

Settlement evidence must bind the user intent, selected execution, receipt/proof, finality, replay/tamper protection, and reorg/failure handling. Bridge providers remain replaceable reviewed adapters.

## 12. Unified Risk, Treasury and Governance

Governance uses role separation, multisignature controls, timelocks where applicable, market/route caps, and emergency controls. A module-specific failure should not automatically stop unrelated healthy modules; a validated shared dependency failure may trigger coordinated Risk/Governance controls.

No single private key should control token supply, treasury, oracle, routing, burn, and emergency privileges.

## 13. LQC Utility and Fees

Approved utility direction includes Lending loan-origination and repayment fee settlement in LQC with protocol burn, subject to final implementation, economic analysis, legal review, governance approval, and on-chain verification.

Additional utility includes the separately accounted LQC Staking Vault. The same canonical staking state may later support reviewed ecosystem functions such as Launchpad tier/allocation eligibility and governance utility through versioned interfaces, without creating duplicate staking custody or duplicate reward accounting.

## 14. Canonical Tokenomics — V1.5 issuance recorded

BSC mainnet (chain ID 56) initial issuance is recorded as confirmed on **2026-10-24** in [Canonical Tokenomics V1.5](CANONICAL_TOKENOMICS.md). The token contract is `0x6d6e197376195c7369C3c5F65e3685629F59025a`; issuance transaction `0x0172ef5f6855bf6f80fd19a7f9539f7a745088d7dec253f6d388ff65d4b89ce3`, block **129416178**. Exactly **1,000,000,000 LQC** was initially allocated to nine management Safe wallets. This records preserved verification evidence, not a new RPC check or a claim about current balances.

Fixed initial and maximum issuance is **1,000,000,000 LQC**, with no post-deployment discretionary mint capability on BSC. Holder-authorized burning may reduce supply. Token name and decimals require deployed-getter evidence before public metadata is finalized.

The **planned TGE public-release budget** is **up to 143,800,000 LQC (14.38% of initial supply)**: Community 80M + Existing Investors 3.8M + Liquidity 60M. It is **not confirmed circulating supply or measured transferable inventory**. The TGE reference time is **2027-02-01 09:00 KST**. Beneficiary distributions, Community 320M registration/funding, actual circulating supply, audit, CEX listing and native-mainnet migration are separate and are not claimed complete.

| Allocation | Designated wallet name | Share | Total LQC | Planned TGE release cap | Post-TGE plan |
|---|---|---:|---:|---:|---|
| Community | LQC Community Wallet | 40% | 400,000,000 | 80,000,000 | 320M capped monthly over 120 months; initial 80M subject to actual recipient distribution |
| Team & contributors | LQC Team Wallet | 20% | 200,000,000 | 0 | 12-month lock, 36 monthly vesting releases in months 13–48 |
| Existing investors | LQC Investor Wallet | 3.8% | 38,000,000 | 3,800,000 | 3-month lock, 24 monthly releases in months 4–27; existing contracts subject to legal validation |
| Liquidity & market making | LQC Liquidity Wallet | 8% | 80,000,000 | 60,000,000 | Remaining 20M subject to approved venue/liquidity mandates |
| Treasury & operations | LQC Treasury Wallet | 8.2% | 82,000,000 | 0 | Approved and disclosed operating budgets |
| Validators & staking | LQC Validator Wallet | 10% | 100,000,000 | 0 | Locked pending native-mainnet activation/settlement evidence; manual Safe-approved payouts for 10 years, capped at 10M per year, 2.5M per quarter, 100M lifetime |
| Ecosystem development | LQC Ecosystem Wallet | 5% | 50,000,000 | 0 | Milestone-driven ecosystem grants |
| Security & risk reserve | LQC Security Wallet | 3% | 30,000,000 | 0 | Multisig-approved security use; not LQUSD backing |
| Mainnet activation | LQC Mainnet Wallet | 2% | 20,000,000 | 0 | Stage-based use after mainnet launch; indicative 24 months |
| **TOTAL** | **9 allocation wallets** | **100%** | **1,000,000,000** | **143,800,000** | |

Community remaining 320M: 120 monthly capped programs; registration and exact funding must precede TGE and were not verified complete at issuance. Team 200M: 12-month lock, then 36 monthly releases in months 13–48. Investor remaining 34.2M: 3-month lock, then 24 monthly releases of 1.425M in months 4–27, subject to legal validation. Validator 100M remains locked pending native-mainnet activation and validated supply/settlement rules: manual 2-of-3 Safe-approved payments to registered operators, over 10 years, capped at 10M/year, 2.5M/quarter and 100M lifetime; activation/calendar/carryover/native-settlement rules remain unresolved.

**Native-mainnet portability:** the global issuance cap must be conserved across BSC and any future native representation. Migration requires provable burn or irrevocable custody/lock and audited 1:1 destination accounting; it is not an implemented bridge or finalized redemption policy. Validator rewards use pre-allocated budget without inflation. The Security reserve is not LQUSD backing.

The nine Safe allocations establish management inventory at the recorded verification block, not beneficial ownership, independent signer control, completed operational vesting or circulation. Current source/ABI, wallet permissions, beneficiary rights and circulation must be verified separately.

**Supersession history:** the former six-category/150M/15% plan and V1.4 pre-issuance statements are historical. Current disclosure follows merged Canonical Tokenomics V1.5; preserve historical evidence.

## 15. Development and Evidence Status

Status terms are evidence-specific:

- **Implemented** — source exists.
- **Unit Tested** — focused tests exist and pass at the pinned revision.
- **Integration Tested** — module interaction is reproducibly tested.
- **Testnet Verified** — relevant chain evidence has been independently reconciled.
- **Security Verified** — applicable internal security gates and independent audit requirements are satisfied.
- **Release Ready** — all required technical, operational, legal, and evidence gates for the release scope are complete.

A lower status never implies a higher status.

## 16. Security and Audit

Target controls include independent smart-contract audit, remediation/retest, multisig, timelock, role separation, emergency pause, controlled TVL/debt/route limits, monitoring, incident response, vesting disclosure, supply reconciliation, and reproducible on-chain evidence.

Repository security tests and audit-preparation documents are not a claim that an independent audit has already been completed.

## 17. CEX Readiness

CEX readiness is developed continuously rather than added after engineering completion. Before submission, the whitepaper, website, token contract, vesting contracts, allocation register, circulating-supply methodology, staking reward budget, market-making inventory, legal/KYB package, audit evidence, and exchange application must be mutually consistent.

Technical artifacts are pinned to commits; on-chain artifacts are pinned to network and verifiable transaction/block evidence.

## 18. Master Development Sequence

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

## 19. Current scope boundary

The project does not claim production readiness, completed independent audit, CEX listing, regulator approval, or a launched LQC Mainnet merely because repository code or testnet evidence exists.

The November 1, 2026 PDF update reconciles tokenomics and recorded issuance with Canonical Tokenomics V1.5 while preserving the September v5.3 technical baseline. It does not certify other architecture/status sections as newly validated; broader reconciliation against the Architecture Freeze Implementation Matrix and Conflict Register remains separate.
