# LQC MASTER DEVELOPMENT PLAN

Status: Canonical development sequence
Rule: GitHub `main` and this plan are the source of truth. Only one major development track may be ACTIVE at a time. Work/ChatGPT sessions must read the current state before changing code.

## 1. Repository Baseline and Reconciliation
- 1/1 Confirm latest `main` SHA and CI status.
- 1/2 Audit Router 2.0 current implementation and deployment evidence.
- 1/3 Audit Lending implementation and dependency map.
- 1/4 Audit all Lending tests and map coverage/gaps.
- 1/5 Compare PR #70 with existing Lending Core; classify duplicate vs reusable safety improvements.
- 1/6 Audit Intent PRs #63/#64; preserve reusable code without merging stale bases.
- 1/7 Audit Futures PR #69 and isolate its dependency boundary.
- 1/8 Classify old open PRs as absorbed, superseded, reusable, or obsolete.
- 1/9 Record final baseline/current-state document and freeze the sequence.

## 2. Lending Core Completion
- 2/1 Collateral deposit/withdraw verification.
- 2/2 Liquidity supply/withdraw verification.
- 2/3 Borrow verification: caps, minimum borrow, LTV and liquidity.
- 2/4 Repay and debt-accounting verification.
- 2/5 Interest rate/index accrual verification.
- 2/6 Oracle, LTV, liquidation threshold and health-factor verification.
- 2/7 Liquidation verification.
- 2/8 Bad-debt, reserves and supplier-loss verification.
- 2/9 Lending security, fuzz/invariant and boundary testing.

## 3. Lending Testnet Integration
- 3/1 Deployment configuration/preflight.
- 3/2 Registry/oracle on-chain verification.
- 3/3 Collateral and liquidity supply/withdraw testnet flow.
- 3/4 Borrow/repay testnet flow.
- 3/5 Health-factor testnet verification.
- 3/6 Liquidation scenario.
- 3/7 Full Lending E2E gate.

## 4. Intent Core
- 4/1 EIP-712 Intent.
- 4/2 IntentHub lifecycle.
- 4/3 Escrow/lock.
- 4/4 Cancel, expiry and replay protection.

## 5. Solver Network
- 5/1 SolverRegistry.
- 5/2 SolverBond.
- 5/3 Reputation.
- 5/4 Quote/auction.
- 5/5 Best Execution Score.

## 6. Settlement
- 6/1 SettlementHub.
- 6/2 Execution verification.
- 6/3 Challenge.
- 6/4 Slash.

## 7. Intent + Router 2.0 Integration
- 7/1 Intent to Solver.
- 7/2 Solver to Router 2.0.
- 7/3 Split/Best Routing.
- 7/4 Receipt/replay protection.
- 7/5 Integrated E2E gate.

## 8. Cross-chain
- 8/1 Bridge Adapter Registry.
- 8/2 Cross-chain Solver.
- 8/3 Settlement verification.
- 8/4 Risk limits.
- 8/5 Cross-chain E2E gate.

## 9. Futures
- 9/1 Oracle.
- 9/2 Margin/position.
- 9/3 Funding/fees.
- 9/4 Liquidation.
- 9/5 Insurance/ADL.
- 9/6 Futures E2E gate.

## 10. Security and Audit
- 10/1 Unit/integration suite.
- 10/2 Fuzz/invariant suite.
- 10/3 Attack-path suite.
- 10/4 External-audit package.
- 10/5 Audit remediation; Critical/High findings resolved before release.

## 11. Release Candidate
- 11/1 Full testnet integration.
- 11/2 Multisig/governance verification.
- 11/3 Emergency controls.
- 11/4 Release gate.
- 11/5 LQC Flow release candidate.

## 12. LQC Native Mainnet
- 12/1+ Separate project after LQC Flow stabilization; migration design must preserve compatibility with the completed system.

## Execution Rules
1. Use Arabic major numbers (`1`, `2`, ...) and work-unit numbers (`1/1`, `1/2`, ...).
2. Exactly one work unit is ACTIVE at a time unless a documented dependency explicitly requires otherwise.
3. Before each work unit: verify `main` SHA, CI, active PR and deployment evidence.
4. Do not modify historical deployment evidence to make current candidate code pass.
5. No stale-base PR is merged directly; rebase/reapply onto the verified current baseline and rerun CI.
6. Testnet deployment is a separate gate from local/code completion.
7. Mainnet activation requires independent audit and a separately approved release process.
8. Every completed work unit must record evidence and the next work unit.
