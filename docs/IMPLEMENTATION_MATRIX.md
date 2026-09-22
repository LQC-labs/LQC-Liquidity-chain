# LQC Implementation Matrix

Status: **current evidence matrix after Master 6/14 synchronization**  
Rule: status is evidence-specific. Existing code is reused; no capability receives higher completion credit than its evidence supports.

| Master | Capability | Repository implementation | Tests / integration | BSC Testnet / on-chain evidence | Current credit | Primary gap / next gate |
|---:|---|---|---|---|---|---|
| 1 | Architecture Freeze | Canonical Master Plan, whitepaper source, tokenomics, conflict register and architecture decisions present | Architecture exit checks recorded | Not an on-chain completion claim | **ARCHITECTURE PASS** | Preserve consistency while later stages evolve |
| 2 | LQC Flow AMM / Swap | Factory, Pair, Router present | Master 2 completion gate merged and PASS; AMM/liquidity/multihop/native-BNB/minOut/deadline coverage present | Historical swap evidence and read-only runtime observations preserved; full current-release Testnet evidence remains narrower than production readiness | **REPOSITORY COMPLETION PASS / HISTORICAL TESTNET EVIDENCE** | Reuse; only later release-evidence gaps if required |
| 3 | Router 2.0 / Best Execution | Registry, V2/V3 adapters, QuoteRouter, ExecutionRouter, SplitOptimizer, AutoRouter, GasCostOracle, RiskRegistry, BestExecutionProof and gateway foundations present | Master 3 completion gate merged and PASS; broad Router2 regression exists | Historical Router2/Flow/Pancake and proof-bound evidence preserved; latest production-grade on-chain enforcement is not inferred | **REPOSITORY COMPLETION PASS / SUBSTANTIAL TESTNET HISTORY** | Reuse; revalidate proof/settlement binding at its later integration/security gate |
| 4 | Vault / Liquidity | LQCLiquidityVault + strategy adapters present | Master 4 Vault E2E completion gate PASS | Full current operational Testnet bundle not claimed | **REPOSITORY E2E PASS** | Reuse; reconcile Testnet strategy state during Full BSC Integration |
| 5 | Oracle Foundation | Lending OracleManager; Futures oracle adapter; Router price-feed interfaces | Master 5 Oracle E2E completion gate PASS | Lending dual-feed and Futures Oracle evidence preserved | **REPOSITORY E2E PASS / MODULE-SPECIFIC TESTNET VERIFIED** | Reuse shared interface; revalidate consuming modules during integration |
| 6 | Lending Core | Registry, RateModel, InterestIndex, Core, LiquidationEngine, OracleManager present | 6/13 focused repository E2E readiness gate PASS | **10/10 clean BSC Testnet deployment verified**; Governance configuration and market activation are not implied | **REPOSITORY E2E PASS + CLEAN TESTNET DEPLOYMENT VERIFIED** | Preserve deployment; separately gate Governance configuration, activation and current Testnet E2E |
| 6 | Lending Risk policy | Health-Factor logic, hard ceilings and bad-debt controls present | 50% max-LTV, liquidation, reserve/bad-debt and invariant tests present | Controlled pilot candidate 50/70/5 preserved as configuration evidence | **POLICY + TEST COVERAGE + TESTNET CONFIG EVIDENCE** | Economic simulation / independent audit before production |
| 6 | Supply Earn | Existing RateModel, supply index and liquidity-share accounting reused; no duplicate Earn vault | **6/14 Supply Earn reuse gate PASS**; existing Lending interest E2E verifies borrower interest → supplier yield → reserves | No dedicated current-release user-facing Earn Testnet bundle claimed | **REPOSITORY REUSE GATE PASS** | UI/integration evidence later; no Core rewrite |
| 6 | LQC Staking / Stage 6 integration | Canonical principal vault + versioned read interface; separate pre-funded rewards; lock/cooldown/unstake; bounded governance/emergency controls; Lending accounting isolated | 6/15 Vault PASS; 6/16 Rewards PASS; 6/17 Exit PASS; 6/18 Governance PASS; **6/19 Lending + Earn + Staking E2E PASS** | Staking remains repository-only; Lending clean 10/10 BSC Testnet deployment evidence preserved separately | **STAGE 6 REPOSITORY E2E PASS** | Separate Testnet/deployment/economic approval gates remain; next Master 7 Futures |
| 7 | Futures Core | MarketRegistry, FuturesVault, PerpEngine with canonical reduction, conserved funding, segregated trading fees, **Futures-only Insurance reserve coverage + explicit residual bad debt**, Aggregator Oracle + runtime V3 TWAP reference; ADL application foundation present | 7/1 reuse PASS; 7/2 Oracle PASS; 7/4 gap review PASS; 7/5-1 reduction PASS; 7/5-2 funding PASS; 7/5-3 fees PASS; **7/5-4 Insurance/bad-debt focused CI PASS** | 7/3 historical lineage preserved; current 7/5 Engine/Vault extensions remain repository-only until later Testnet deployment | **7/5 ON-CHAIN GAP IMPLEMENTATION IN PROGRESS — THROUGH 7/5-5** | **7/5-5 Partial Liquidation → 7/5-6 ADL → 7/5-7 integrated full regression** |

## Cross-module dependency rules

1. LQC Flow consumes Router execution but remains a user-facing application boundary.
2. Router/Vault/Oracle/Risk are shared through reviewed interfaces; module accounting is not shared implicitly.
3. Lending and Futures remain separate accounting and failure domains.
4. Intent/Solver may route execution into approved protocol capabilities but cannot bypass module risk controls.
5. Settlement/Verification authenticates execution outcomes and must not invent execution success.
6. BSC-specific addresses and providers remain adapter/configuration concerns.
7. Mainnet portability review is mandatory for new Core changes.
8. CEX evidence is accumulated continuously; repository implementation alone is never a listing-readiness claim.
9. One canonical LQC Staking Vault is developed in Master 6; future Launchpad integration may consume a reviewed read-only/versioned staking interface but does not create duplicate staking custody or reward accounting.

## Remaining execution / external gates

- Lending Governance configuration, market enablement and current Testnet E2E remain separately gated despite the clean 10/10 deployment.
- Exact Staking reward budget/emission parameters require economic/governance approval; no new supply or guaranteed APY is implied.
- Full-system BSC E2E remains Master 12.
- Independent audit and remediation/retest remain Master 13.
- Token/vesting/circulation, legal/KYB and liquidity/MM evidence remain Master 14 external gates.
