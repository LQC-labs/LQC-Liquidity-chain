# LQC Architecture Freeze — Gap Dependency and Execution Order

Status: **approved working order for closing Architecture Freeze gaps**  
Source: Implementation Matrix + Conflict Register + Canonical Whitepaper + Master Development Plan.

## Principle

Do not close gaps in discovery order. Close them in dependency order so one decision does not invalidate later work.

## Gap order

| Order | Gap | Why this position | Can run in parallel? | Exit evidence |
|---:|---|---|---|---|
| G1 | Shared Oracle interface boundary for Lending/Futures | Oracle semantics affect both financial modules and future Mainnet portability; must be defined before final module integration | Documentation/interface analysis can run with G2 | Versioned interface boundary, failure isolation rules, no unsafe shared mutable accounting |
| G2 | Router Best Execution proof-bound on-chain enforcement | Intent/Solver/Settlement completion depends on what the canonical Router actually verifies on-chain | Can run with G1 | Latest code path mapped; proof/intent/expiry/replay/settlement binding tests; Testnet plan |
| G3 | Lending Stage4 reuse vs selective redeploy decision | Depends on frozen risk/oracle/deployment architecture; must be resolved before any new Lending transaction | Evidence analysis can start after G1 design is stable | Reuse matrix for Stage1-3/Core; Stage4 incident classification; exact redeploy boundary; deployment lock rules |
| G4 | Staking reward-source/economic boundary | Does not block Core Lending, Router or Futures; tokenomics must be frozen before Staking implementation | Yes, parallel economic/document work | fixed-supply budget source, emission/revenue separation, circulation treatment, governance limits |
| G5 | Full BSC E2E design | Must consume the final interfaces and reuse decisions from G1-G4 | No finalization before G1-G3 | deterministic module order, test actors, assets, failure cases, evidence bundle, rollback/emergency criteria |
| G6 | External Audit / CEX evidence plan | Audit scope depends on frozen integrated architecture; legal/market evidence can be prepared in parallel but cannot close Architecture Freeze technical gates | Partial parallel preparation | pinned scope/commit plan, evidence owners, external dependencies, no false completion claims |

## Architecture Freeze exit gate

Architecture Freeze may close when:

1. Canonical whitepaper source, Master Plan, Tokenomics, Risk Policy, Conflict Register and Implementation Matrix agree.
2. G1-G5 have explicit approved designs/decisions sufficient to start dependent engineering without architecture ambiguity.
3. No unresolved historical stage label or stale document can control current development.
4. New deployments are still prohibited until their Master-stage prerequisites and deployment review gates are met.
5. G6 external work is clearly scoped and scheduled; external audit itself is not required to close Architecture Freeze.
6. The next executable Master slot is identified from the earliest unresolved dependency, not from historical PR numbering.

## Parallel work rule

Only work that cannot change a shared interface, accounting invariant, deployment address assumption, or risk parameter may proceed in parallel. Shared Router/Oracle/Vault/Risk changes require an Integration Gate before merge.
