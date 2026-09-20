# LQC Architecture Freeze Conflict Register

Status: **Architecture Freeze reconciled register**  
Purpose: prevent stale whitepaper, repository, testnet, tokenomics, and historical stage assumptions from silently controlling current development.

| ID | Conflict | Canonical direction | Required action | Status |
|---|---|---|---|---|
| CF-01 | Historical Lending 45% LTV / 60% threshold / 5% penalty vs implemented/testnet policy | Health-Factor model; protocol max-LTV hard ceiling 50%; controlled BSC pilot candidate 50/70/5; asset-specific tightening allowed | Whitepaper and all public docs must use the approved Risk Engine distinction between hard ceilings and active market parameters | RESOLVED — CANONICAL SOURCE |
| CF-02 | Fixed-price-decline liquidation language in older concepts | Liquidation depends on debt value, collateral value, configured threshold and Health Factor; not a fixed token-price decline | Remove obsolete fixed-decline language from current whitepaper | RESOLVED — CANONICAL SOURCE |
| CF-03 | Historical 300M initial circulation / 3.8% investor / earlier vesting variants | 1B fixed supply; 150M/15% TGE; canonical allocation table in CANONICAL_TOKENOMICS.md | Do not reuse superseded values | RESOLVED |
| CF-04 | Staking utility previously under review vs newly approved modular direction | Lending Supply Earn + separate LQC Staking Vault; no guaranteed APY; rewards reconcile to fixed supply | Add to whitepaper architecture, utility, tokenomics and roadmap | RESOLVED — CANONICAL SOURCE |
| CF-05 | Historical Cross-chain/Bridge framing | Intent + Solver + Settlement + reviewed Bridge Adapter Registry; no proprietary bridge embedded in Core | Rewrite current whitepaper cross-chain architecture | RESOLVED — CANONICAL SOURCE |
| CF-06 | BSC-first implementation could become chain-specific Core | Chain-neutral Core; BSC dependencies isolated through adapters/configuration; future LQC Mainnet portability mandatory | Add portability rule to whitepaper architecture/roadmap | RESOLVED — CANONICAL SOURCE |
| CF-07 | Futures, Lending and other modules risk being treated as separate projects or sharing unsafe state | One ecosystem with independent accounting/failure domains and reviewed shared interfaces | Preserve Router/Oracle/Vault/Risk/Governance integration gates | RESOLVED |
| CF-08 | Historical 12-stage DEVELOPMENT_SEQUENCE vs new 15-stage Master Plan | docs/MASTER_DEVELOPMENT_PLAN.md is current execution baseline; historical plan remains audit evidence | Legacy sequence marked superseded | RESOLVED |
| CF-09 | Historical Solver Stage 6/7 numbering drift | Current Master numbering owns future work; historical PR labels remain audit evidence only | Historical capabilities remapped to Master 8/9 | RESOLVED |
| CF-10 | Router Best Execution historical client/SDK proof enforcement vs later ProofBound gateway implementation | Reuse existing Router; selectively deploy/review current BestExecutionProof + ProofBoundGateway at Master gate; Settlement remains separate | Architecture decision recorded in ROUTER2_PROOF_ENFORCEMENT_DECISION.md | ARCHITECTURE RESOLVED / EXECUTION PENDING |
| CF-11 | Lending Stage1-3 verified deployments vs Stage4 nonce/deployment incident | Revalidate/reuse Stage1-3/Core; reject stale Stage4 predicted address/packet; fresh isolated Stage4 deployment review later | Root cause/reuse boundary recorded in LENDING_STAGE4_ROOT_CAUSE.md | ARCHITECTURE RESOLVED / EXECUTION PENDING |
| CF-12 | CEX evidence contains pending audit/token/vesting/legal/market evidence | CEX readiness requires reproducible technical evidence plus external audit, token/vesting, circulation, KYB/legal and liquidity/MM evidence | External workstreams defined in EXTERNAL_AUDIT_CEX_EVIDENCE_PLAN.md | PLANNED EXTERNAL GATE — NOT A FREEZE BLOCKER |

## Freeze rule

No stale document or historical PR title overrides the current canonical documents. A conflict is closed only when the whitepaper, repository implementation/configuration, tests, testnet evidence, website/public disclosure, and CEX evidence are consistent at the level relevant to that conflict.

## Current canonical documents

- docs/MASTER_DEVELOPMENT_PLAN.md
- docs/LENDING_RISK_ENGINE_POLICY.md
- docs/CANONICAL_TOKENOMICS.md
- docs/CEX_LISTING_READINESS.md
- docs/OFFICIAL_DEVELOPMENT_STAGE_MAPPING.md (historical correction evidence only)
- docs/LQC_WHITEPAPER_CANONICAL.md
- docs/IMPLEMENTATION_MATRIX.md
- docs/ORACLE_INTERFACE_BOUNDARY.md
- docs/ROUTER2_PROOF_ENFORCEMENT_DECISION.md
- docs/LENDING_STAGE4_ROOT_CAUSE.md
- docs/STAKING_REWARD_ECONOMIC_BOUNDARY.md
- docs/FULL_BSC_TESTNET_E2E_DESIGN.md
- docs/EXTERNAL_AUDIT_CEX_EVIDENCE_PLAN.md
