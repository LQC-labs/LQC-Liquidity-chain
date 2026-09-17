# LQC MASTER DEVELOPMENT PLAN — WHITEPAPER v5.6

Status: Canonical development sequence
Source of truth for sequence: `LQC Whitepaper v5.6 — Intent + Solver + Mainnet Path`, especially §13 Roadmap and §13.8 Native Mainnet Transition.
Repository rule: GitHub `main` is the code/deployment evidence baseline. This document defines development order. `docs/LQC_CURRENT_STATE.md` records the single ACTIVE work unit.

## 1. Gate 0 — Existing Baseline Freeze
Whitepaper §13.1: preserve Router 2.0, Proof, Registry, DEX Adapter, Vault and BSC testnet deployment evidence and pass full regression before new architecture changes.
- 1/1 Pin current `main` SHA, CI/check evidence and deployment records.
- 1/2 Verify Router 2.0: Quote Router, Execution Router, Split Optimizer and protected execution.
- 1/3 Verify Best Execution Proof and proof/deployment artifact consistency.
- 1/4 Verify DEX Registry and approved Adapter set, including PancakeSwap V2/V3 boundaries.
- 1/5 Verify Liquidity Vault/accounting/caps and safe withdrawal behavior.
- 1/6 Verify Router/Vault risk controls, emergency controls and governance boundaries.
- 1/7 Verify BSC testnet deployment evidence without rewriting historical evidence.
- 1/8 Run/verify full baseline regression and record unresolved gaps.
- 1/9 Freeze Gate 0 evidence and only then advance to Gate 1.

## 2. Gate 1 — Core Intent
Whitepaper §13.2 and §8.1.
- 2/1 Define EIP-712 Intent domain/types: source asset, amount, destination, recipient, minimum output, deadline, nonce and salt.
- 2/2 Implement/verify SourceEscrow order-isolated asset lock.
- 2/3 Implement/verify IntentHub signature and domain validation.
- 2/4 Implement nonce and replay protection.
- 2/5 Implement deadline/expiry handling.
- 2/6 Implement cancellation and refund.
- 2/7 Verify invalid signature, expired intent, replay, duplicate nonce and reentrancy cases.
- 2/8 Gate 1 regression and evidence record.

## 3. Gate 2 — Internal Solver / BSC Same-chain Intent
Whitepaper §13.3 and §8.5 Phase 1.
- 3/1 Use the existing Router 2.0 as the first Internal Solver execution path.
- 3/2 Connect IntentHub/SourceEscrow to Same-chain quote and execution.
- 3/3 Preserve minimum output, recipient, deadline, route/proof and atomic-revert guarantees.
- 3/4 Produce deterministic execution receipt/proof linkage.
- 3/5 Complete one BSC Same-chain Intent atomically from asset lock through execution receipt.
- 3/6 Run failure/rollback/replay regression.
- 3/7 Gate 2 E2E evidence record.

## 4. Gate 3 — Solver Risk and Competition
Whitepaper §13.4, §8.2 and functional specifications.
- 4/1 Implement/verify SolverRegistry.
- 4/2 Implement/verify SolverBond with separated LQC and approved-stablecoin accounting.
- 4/3 Apply Oracle haircut and safety reserve to bond capacity.
- 4/4 Implement withdrawal delay and solver activation controls.
- 4/5 Implement unsettled exposure reservation/release and available-capacity limits.
- 4/6 Implement QuoteManager and solver-signed quotes.
- 4/7 Implement deterministic risk-adjusted quote selection using net output, gas, fees, slippage, success probability/latency, bond, capacity and risk penalty.
- 4/8 Implement Reputation accounting.
- 4/9 Test bond, exposure, quote replay, insufficient capacity and emergency pause paths.
- 4/10 Gate 3 regression and evidence record.

## 5. Gate 4 — Composite Intent / Router + Vault + Lending
Whitepaper §13.5. Cross-chain composition is prohibited until this Same-chain gate passes.
- 5/1 Freeze/verify the Same-chain Lending baseline: collateral custody, supply/withdraw, borrow/repay, indexed interest and isolated-market accounting.
- 5/2 Verify Lending Oracle, LTV/Health Factor, caps and borrow-pause/safe-repay behavior.
- 5/3 Verify liquidation, close factor, liquidation bonus, reserves and bad-debt recovery.
- 5/4 Complete Lending security tests: exact-transfer, reentrancy, boundary, fuzz/invariant and supplier/accounting invariants.
- 5/5 Validate Lending on BSC testnet before enabling it as an Intent action.
- 5/6 Define Same-chain Action interface and Router Adapter.
- 5/7 Define Vault Action/Adapter with custody and accounting boundaries.
- 5/8 Define Lending Action/Adapter with HF/Oracle/cap checks.
- 5/9 Enforce per-action minimum result and whole-composite atomic revert.
- 5/10 Execute Router + Vault + Lending Composite Intent scenarios.
- 5/11 Gate 4 E2E regression and evidence record.

## 6. Gate 5 — Cross-chain Settlement MVP
Whitepaper §13.6 and §8.3–8.5. LQC does not build its own bridge.
- 6/1 Implement/verify BridgeRegistry with enabled state, risk score, per-tx max, daily limit, supported chains and tokens.
- 6/2 Integrate exactly one reviewed external Bridge Adapter for the MVP.
- 6/3 Restrict MVP to two chains, one approved stablecoin and limited solvers.
- 6/4 Implement/verify SettlementHub lifecycle.
- 6/5 Implement/verify ExecutionVerifier destination-payment proof validation.
- 6/6 Implement challenge window and dispute state.
- 6/7 Implement timeout and user refund.
- 6/8 Implement solver reimbursement only after verified settlement conditions.
- 6/9 Implement slash and reputation consequences.
- 6/10 Add Bridge/Solver/Token/Chain circuit breakers and rate/exposure limits.
- 6/11 Cross-chain E2E: success, bridge failure, solver failure, timeout, challenge, refund and replay.
- 6/12 Gate 5 evidence record.

## 7. Gate 6 — Mainnet Hardening
Whitepaper §13.7, §12.1 and security sections.
- 7/1 Reorg/finality simulation.
- 7/2 MEV and stale-quote/execution-context simulation.
- 7/3 Oracle manipulation, staleness, divergence and multi-feed failure simulation.
- 7/4 Solver default, insufficient bond and exposure exhaustion simulation.
- 7/5 Bridge outage/compromise and circuit-breaker simulation.
- 7/6 Lending liquidity stress, stablecoin depeg, cascading liquidation and bad-debt simulation.
- 7/7 Unit/integration regression across all enabled modules.
- 7/8 Fuzz and invariant testing for Router, Vault, Lending, Intent, Solver and Settlement.
- 7/9 Independent audit pinned to exact commit/compiler/configuration.
- 7/10 Resolve/retest all Critical and High findings; disclose remaining known issues.
- 7/11 Bug bounty, Multisig, Timelock, Guardian, incident-response and recovery drills.
- 7/12 Limited/capped production pilot only after explicit approval.
- 7/13 Gate 6 evidence and release decision.

## 8. EVM-compatible LQC Native Mainnet Program
Whitepaper §13.8. This starts only after BSC Lending + Intent completion and validation; it must not weaken BSC testnet/audit/user-exit gates.
- 8/1 Complete and validate the current BSC Lending and Intent system.
- 8/2 Validate on BSC testnet and, only after approval, a tightly capped production pilot.
- 8/3 Build EVM-compatible LQC testnet: native LQC, validators, RPC, explorer and operational controls.
- 8/4 Redeploy the same audited contracts to LQC; do not copy BSC contract state or addresses.
- 8/5 Operate BSC and LQC in parallel and reconcile accounting, liquidity, finality and incident response.
- 8/6 Migrate LQC token through governance-approved snapshot/claim with duplicate-supply prevention.
- 8/7 Migrate ordinary Lending positions primarily by repay → withdraw → transfer → reopen.
- 8/8 Use Intent/Solver migration automation only after proof, bond, finality and rollback controls are verified.
- 8/9 Shift liquidity and risk limits gradually under chain-specific caps and governance.
- 8/10 Reconcile token supply, user assets, supplier claims, borrower debt, reserves and bad debt at a recorded migration block.
- 8/11 Stop new BSC risk creation only after every position is repaid, migrated or has an enduring safe-exit path.
- 8/12 Cross-chain collateral remains disabled until Same-chain Lending, external infrastructure and migration controls pass separate audits.

## 9. Planned Perpetual Module — Separate Post-Core Gate
Whitepaper §34 marks Perpetual Trading as Planned, not a completed core gate. It must not interrupt Gates 0–6.
- 9/1 Production-grade Index/Mark/Oracle design.
- 9/2 PerpMarketManager and isolated-market parameters.
- 9/3 PositionManager and MarginVault.
- 9/4 FundingRateModel and fee accounting.
- 9/5 Perp liquidation and partial-liquidation controls.
- 9/6 InsuranceFund.
- 9/7 ADLController as last resort.
- 9/8 Testnet order/funding/liquidation/insurance/ADL scenarios.
- 9/9 Independent audit and explicit activation approval.

## Non-negotiable execution rules
1. The whitepaper v5.6 Gate order above is the only official development order.
2. Use Arabic work numbers exactly as written (`1/1`, `1/2`, ...). Do not invent alternate numbering such as M00.
3. Only one work unit is ACTIVE at a time.
4. Do not skip a Gate because code already exists. Existing code must be verified against that Gate and recorded PASS before advancing.
5. GitHub `main` is the evidence baseline; stale PRs are never merged directly. Reapply audited changes onto the then-current verified main.
6. Historical deployment evidence is immutable evidence and must not be edited merely to make current code pass.
7. Code completion, local tests, testnet deployment, audit and production activation are distinct statuses.
8. LQC does not implement a proprietary bridge in Core. Cross-chain uses reviewed external Bridge Adapters/Solver liquidity under risk controls.
9. Cross-chain composition begins only after Gate 4 Same-chain Composite Intent passes.
10. Native Mainnet work begins only under §13.8 prerequisites and never replaces unfinished BSC Lending/Intent validation.
11. Perpetual Trading is a Planned post-core module and must not interrupt the whitepaper Gates 0–6.
12. At the end of every work unit, update `docs/LQC_CURRENT_STATE.md` with evidence, unresolved issues and the exact next work unit.
