# LQC External Audit and CEX Evidence Plan

Status: **Architecture Freeze G6 scope plan — external completion not claimed**

## Purpose

Prepare audit and exchange due-diligence evidence continuously while preserving a strict boundary between internal readiness and third-party approval.

## A. External smart-contract audit package

Audit scope candidate:
- LQC Flow contracts that remain in release scope;
- Router 2.0 Registry/adapters/Quote/Execution/Split/BestExecutionProof/ProofBoundGateway;
- Vault/Liquidity contracts and strategy boundaries;
- Lending Core, Registry, InterestIndex, RateModel, OracleManager, LiquidationEngine;
- Lending Earn/Staking contracts once implemented;
- Futures Registry/Vault/Oracle/PerpEngine and liquidation/insurance/ADL controls;
- IntentHub/Escrow/SolverBinding/InternalSolver;
- Solver Registry/Bond/Exposure/Capacity/Quote/Selection/Reputation once complete;
- Execution Receipt / Settlement / Verification;
- shared Risk/Treasury/Governance interfaces.

Audit handoff must pin:
- exact commit/tag;
- compiler/optimizer/viaIR/EVM settings;
- dependency lock digest;
- deployed/candidate artifact hashes;
- architecture/data-flow diagrams;
- role/privilege matrix;
- invariants and threat model;
- known limitations;
- unit/integration/adversarial test commands/results;
- BSC Testnet evidence bundle;
- excluded/out-of-scope components.

No code changes enter the audit candidate without an explicit scope-delta/retest decision.

## B. Audit finding lifecycle

Finding → severity → owner → fix commit → regression → auditor retest → closure evidence.

Internal test PASS is not an external audit PASS. Critical/High findings required by release policy must be closed/retested before Public Pilot.

## C. Token / supply evidence

Maintain:
- fixed 1B LQC supply;
- canonical allocation register;
- V1.4 maximum targeted TGE transferability **143.8M/14.38%** and separate evidence of **actual** circulating supply (earlier 150M/15% is historical);
- token contract and verified source when deployed;
- mint/burn authority;
- vesting contracts/schedules;
- staking reward source/budget;
- Treasury and Liquidity/MM inventory;
- circulating-supply reconciliation;
- material tokenomics change log.

## D. Governance / custody evidence

Maintain:
- Safe addresses, owners and thresholds;
- role separation;
- timelock where applicable;
- emergency/guardian scope;
- ownership-transfer state;
- privileged-function inventory;
- deployment identities separate from trading/funding identities.

## E. Market and liquidity evidence

Maintain:
- DEX pools/routes;
- liquidity ownership/source;
- market-making inventory and mandate;
- protocol-owned vs third-party liquidity distinction;
- route/liquidity caps;
- manipulation/slippage monitoring;
- no unsupported liquidity claims.

## F. Legal / KYB package

External counsel/compliance work remains outside code completion. Package should track:
- issuing/operating entity information;
- beneficial ownership/directors as legally required;
- KYB documents;
- token legal analysis/classification by target jurisdiction;
- sanctions/AML controls applicable to exchange onboarding;
- terms/privacy/risk disclosures;
- trademark/IP/domain control;
- required whitepaper/regulatory filings for target markets.

Do not claim regulator or exchange approval before written evidence exists.

## G. CEX technical integration evidence

Prepare:
- token symbol/name/decimals/chain/contract;
- deposit/withdrawal behavior;
- explorer and verified contract source;
- supply/circulation endpoints or methodology;
- wallet integration notes;
- burn/fee behavior;
- smart-contract upgradeability/privileges;
- incident contacts;
- test transfers after token deployment;
- chain/Mainnet migration policy if later applicable.

## H. Evidence status vocabulary

Use only:
- INTERNAL PREPARATION
- READY FOR EXTERNAL REVIEW
- SUBMITTED
- THIRD-PARTY REVIEW IN PROGRESS
- FINDINGS OPEN
- RETEST IN PROGRESS
- EXTERNAL EVIDENCE COMPLETE

Never convert an internal repository artifact into a claim of exchange listing, legal approval, or audit completion.

## I. Architecture Freeze G6 exit

G6 closes for Architecture Freeze when the external workstreams, evidence owners/types, pinned-scope rules, and status vocabulary are defined.

Actual audit, legal/KYB completion, liquidity/MM onboarding, token deployment/vesting verification, and exchange decisions remain later Master 13/14 gates.
