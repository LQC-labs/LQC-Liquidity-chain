# LQC Architecture Freeze Implementation Matrix

Status: **working evidence matrix**  
Rule: status is evidence-specific. Existing code is reused; no capability receives higher completion credit than its evidence supports.

| Master | Capability | Repository implementation | Tests / integration | BSC Testnet evidence | Current credit | Primary gap / next gate |
|---:|---|---|---|---|---|---|
| 2 | LQC Flow AMM / Swap | Factory, Pair, Router present | AMM, liquidity, multihop, native-BNB, minOut/deadline tests | Manual bidirectional buy/sell evidence; one canonical sell hash recorded | TESTNET VERIFIED — PARTIAL | Complete receipt/log evidence set and current regression |
| 3 | Router 2.0 Registry / adapters / quote / execution | Registry, V2/V3 adapters, QuoteRouter, ExecutionRouter, SplitOptimizer, AutoRouter, GasCostOracle, RiskRegistry present | Broad Router2 boundary/regression/readiness suite | LQC Flow + Pancake V3 quote comparison and execution evidence | TESTNET VERIFIED — SUBSTANTIAL | Reconcile current deployed stack with latest code |
| 3 | Best Execution Proof / proof-bound execution | BestExecutionProof + ProofBoundExecutionGateway present | proof gateway EVM/adversarial/release tests present | Historical proof-bound execution success; record states historical client/SDK enforcement and proof not then verified on-chain | INTEGRATION TESTED / HISTORICAL TESTNET EVIDENCE | Verify latest gateway on-chain enforcement + settlement binding |
| 4 | Vault / Liquidity | LQCLiquidityVault + strategy adapters present | deposit/withdraw/accounting/cap/invariant/router-risk tests | Full current Vault operational evidence not yet reconciled | INTEGRATION TESTED | Testnet evidence and strategy-state reconciliation |
| 5 | Oracle Foundation | Lending OracleManager; Futures oracle adapter; Router price-feed interfaces | Lending/Futures oracle tests and guards present | Lending dual-feed config and Futures Oracle deployment evidence exist | TESTNET VERIFIED — MODULE-SPECIFIC | Define shared interface/version boundary without unsafe shared state |
| 6 | Lending Core | Registry, RateModel, InterestIndex, Core, LiquidationEngine, OracleManager present | supply/withdraw, borrow, repay, HF, liquidation, bad debt, security gates | Stage1 Oracle/RateModel verified; Stage2 Registry/Index verified; Core deployment evidence recorded | TESTNET VERIFIED — PARTIAL | Resolve Stage4 history; validate reuse vs selective redeploy |
| 6 | Lending Risk policy | Contract hard ceilings and HF logic present | 50% LTV, liquidation, bad-debt gates present | frozen pilot config 50/70/5 | POLICY + TESTNET CONFIG RECONCILED | Economic simulation / audit before production |
| 6 | Supply Earn | RateModel already calculates supply rate from borrow rate, utilization and reserve factor | interest tests exist | no dedicated user-facing Earn testnet evidence | IMPLEMENTED FOUNDATION | Earn accounting/UI/E2E |
| 6 | LQC Staking Vault | architecture approved; no canonical staking contract credited yet | none credited | none | PLANNED | Staking Vault, rewards, claim, cooldown/unstake, governance tests |
| 7 | Futures Core | MarketRegistry, FuturesVault, PerpEngine, Oracle adapter present | position/order/funding/leverage/liquidation/insurance/ADL/emergency/security/E2E tests | Registry/Vault/Oracle/Engine deployed; guarded BTC/USDT 5x LONG checkpoint | TESTNET VERIFIED — SUBSTANTIAL | Latest-main regression + shared-interface integration |
| 8 | Intent / Internal Solver | IntentHub, CoreIntentState, Escrow, SolverBinding, InternalSolver, Receipt present | intent replay/expiry/cancel, internal-solver-router, same-chain E2E tests | integrated BSC evidence not yet fully reconciled | INTEGRATION TESTED | Current BSC same-chain evidence gate |
| 9 | Solver Network | Registry, BondVault, Exposure, Reputation, Assignment, BestExecutionScore present | component tests present | live Solver Network evidence not credited | IMPLEMENTED / TESTED FOUNDATION | LQC/Stable bond policy, QuoteManager, competition E2E, Testnet |
| 10 | Settlement / Verification | ExecutionReceipt + ExecutionVerifier present | execution-verifier + settlement-proof invariant tests | full live settlement evidence not credited | IMPLEMENTED / TESTED FOUNDATION | finality/reorg/challenge + integrated Testnet settlement |
| 11 | Risk / Treasury / Governance | Router RiskRegistry/Emergency; role-specific Safe records | risk/emergency tests present | Governance 4/7, Risk 3/5, Guardian 3/5, Treasury 3/5 verified on chain | TESTNET VERIFIED — GOVERNANCE FOUNDATION | Timelock/role integration across final module set |
| 12 | Full BSC Integration | individual modules exist | many module E2Es exist | no single current full-system evidence bundle | NOT YET CREDITED | Flow↔Router↔Vault↔Lending↔Futures↔Intent/Solver↔Settlement full E2E |
| 13 | Security / Audit | security matrices, audit scope/handoff exist | broad internal security suites | independent audit not completed | INTERNAL PREPARATION | pinned audit commit, external audit, remediation/retest |
| 14 | Token / CEX | canonical tokenomics + CEX readiness docs exist | documentation consistency controls | final token/vesting/circulation evidence pending | DOCUMENTATION READY — PARTIAL | token/vesting on-chain evidence, KYB/legal, liquidity/MM, audit |
| 15 | Pilot / Mainnet Path | portability rules approved | no release credit | no LQC Mainnet launch claim | PLANNED | capped pilot first; then Mainnet testnet and audited migration |

## Cross-module dependency rules

1. LQC Flow consumes Router execution but remains a user-facing application boundary.
2. Router/Vault/Oracle/Risk are shared through reviewed interfaces; module accounting is not shared implicitly.
3. Lending and Futures remain separate accounting and failure domains.
4. Intent/Solver may route execution into approved protocol capabilities but cannot bypass module risk controls.
5. Settlement/Verification authenticates execution outcomes and must not invent execution success.
6. BSC-specific addresses and providers remain adapter/configuration concerns.
7. Mainnet portability review is mandatory for new Core changes.
8. CEX evidence is accumulated continuously; repository implementation alone is never a listing-readiness claim.

## Architecture Freeze decisions still required

- IM-01: verify latest Router proof-bound on-chain enforcement and settlement binding.
- IM-02: classify Lending Stage4 incident and decide exact reuse/selective-redeploy boundary.
- IM-03: define Oracle shared-interface boundary for Lending/Futures without coupling failure domains.
- IM-04: pin exact Staking reward source/budget only after economic review; no new supply.
- IM-05: complete current full-system BSC E2E evidence design.
- IM-06: external audit, legal/KYB, token/vesting, circulation, and liquidity/MM remain later external gates.
