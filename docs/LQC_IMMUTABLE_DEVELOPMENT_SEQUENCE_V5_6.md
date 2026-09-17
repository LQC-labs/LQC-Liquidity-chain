# LQC IMMUTABLE DEVELOPMENT SEQUENCE — WHITEPAPER v5.6

Status: **CANONICAL / FROZEN**
Source: `LQC_Whitepaper_v5.6_KR_Intent_Solver_Mainnet_Path`

## Non-negotiable rule
This is the single development numbering system for LQC. Work, ChatGPT, Codex, developers and future sessions MUST use this sequence. Do not renumber, reorder, skip, insert, merge or reinterpret work units during execution.

A change to this sequence is permitted only when BOTH conditions are satisfied:
1. the LQC whitepaper itself is formally revised to a later approved version; and
2. the project owner explicitly approves replacing this sequence.

Until then, this file outranks prior M00/M01 numbering, prior MASTER numbering, chat numbering and Work-session numbering.

## 1. LQC Flow / DEX Core
- 1/1 AMM Factory / Pair
- 1/2 Liquidity
- 1/3 Swap
- 1/4 Multi-hop
- 1/5 Native BNB
- 1/6 minOut / Deadline
- 1/7 Core security and tests

## 2. Router 2.0
- 2/1 DEX Registry
- 2/2 V2 Adapter
- 2/3 V3 Adapter
- 2/4 Quote Router
- 2/5 Gas-aware Route Selection
- 2/6 Split Optimizer
- 2/7 Execution Router
- 2/8 Best Execution Proof
- 2/9 Risk / Emergency Control
- 2/10 Router full regression

## 3. Liquidity Vault
- 3/1 Deposit
- 3/2 Withdraw
- 3/3 Accounting
- 3/4 Access Control
- 3/5 Cap / Risk
- 3/6 Invariant / Security

## 4. Lending
- 4/1 Collateral Deposit / Withdraw
- 4/2 Supply / Withdraw
- 4/3 Borrow
- 4/4 Repay
- 4/5 Interest Rate / Index
- 4/6 Oracle
- 4/7 LTV / Health Factor
- 4/8 Liquidation
- 4/9 Bad Debt / Reserve
- 4/10 Security / Invariant
- 4/11 BSC Testnet E2E

## 5. Core Intent
- 5/1 EIP-712 Intent
- 5/2 SourceEscrow
- 5/3 IntentHub
- 5/4 Nonce / Replay Protection
- 5/5 Deadline / Expiry
- 5/6 Cancel / Refund
- 5/7 Intent Security Test

## 6. Internal Solver
- 6/1 Router 2.0 as Internal Solver
- 6/2 Intent -> Solver
- 6/3 Escrow -> Router execution
- 6/4 Execution Receipt
- 6/5 BSC Same-chain Intent E2E

## 7. Solver Network / Risk
- 7/1 SolverRegistry
- 7/2 SolverBond
- 7/3 Stablecoin / LQC Bond
- 7/4 Exposure / Capacity
- 7/5 QuoteManager
- 7/6 Solver Competition
- 7/7 Risk-adjusted Best Execution
- 7/8 Reputation

## 8. Composite Intent
- 8/1 Router Action
- 8/2 Vault Action
- 8/3 Lending Action
- 8/4 Per-action minimum result
- 8/5 Full atomic revert
- 8/6 Same-chain Composite E2E

## 9. Cross-chain Settlement
- 9/1 BridgeRegistry
- 9/2 External Bridge Adapter
- 9/3 Cross-chain Solver
- 9/4 SettlementHub
- 9/5 ExecutionVerifier
- 9/6 Challenge
- 9/7 Timeout / Refund
- 9/8 Slash
- 9/9 Risk / Rate Limits
- 9/10 Cross-chain E2E

## 10. Mainnet Hardening / Security
- 10/1 Reorg
- 10/2 MEV
- 10/3 Oracle Attack
- 10/4 Solver Failure
- 10/5 Bridge Failure
- 10/6 Economic Stress
- 10/7 Fuzz / Invariant
- 10/8 Multisig / Timelock / Guardian
- 10/9 Independent External Audit
- 10/10 Critical / High = 0
- 10/11 Limited Pilot

## 11. Perpetual / Futures
- 11/1 Market Manager
- 11/2 Position Manager
- 11/3 Margin Vault
- 11/4 Funding
- 11/5 Liquidation
- 11/6 Insurance Fund
- 11/7 ADL
- 11/8 Oracle / Mark / Index
- 11/9 Testnet E2E
- 11/10 Separate Audit / Activation Gate

## 12. LQC Native Mainnet
- 12/1 EVM-compatible LQC Testnet
- 12/2 Validator / RPC / Explorer
- 12/3 Redeploy audited contracts
- 12/4 BSC + LQC parallel operation
- 12/5 Snapshot / Claim
- 12/6 Lending Migration
- 12/7 Intent / Solver Migration
- 12/8 Liquidity / Risk Cap migration
- 12/9 Reconciliation
- 12/10 End new BSC risk creation only after safe-exit gate

## Mandatory execution protocol
For every work unit, use exactly this lifecycle:

`CURRENT NUMBER -> verify GitHub code -> verify tests -> implement only missing work -> regression -> record evidence -> PASS -> next number`

Rules:
- Existing code is not rebuilt merely because a work unit is revisited.
- Code presence alone is not PASS.
- PR-only code is marked PR-only until integrated and verified.
- Local test completion and BSC testnet completion are separate states.
- No work unit may be skipped because a later module already exists.
- Historical branches/PRs remain evidence and are not silently merged.
- Work/ChatGPT interruptions do not change the ACTIVE number.
- Every session must read this file and the current-state file before modifying code.

## Whitepaper alignment gates
The development sequence above implements the v5.6 roadmap while preserving its formal gates:
- Gate 0: preserve and regress Router 2.0 / Proof / Registry / DEX Adapter / Vault / BSC testnet baseline.
- Gate 1: Core Intent.
- Gate 2: Internal Solver and BSC Same-chain Intent.
- Gate 3: Solver Risk.
- Gate 4: Composite Intent with Router / Vault / Lending.
- Gate 5: Cross-chain Settlement using external Bridge Adapter(s), not an LQC-owned bridge.
- Gate 6: Mainnet Hardening.
- Native LQC Mainnet remains a later staged migration program.

## Change control
Any future proposed change must be written as a separate proposal. This canonical file MUST NOT be overwritten merely to match an in-progress branch, PR, Work session, or ChatGPT suggestion. Only an approved later whitepaper revision plus explicit project-owner approval may replace it.
