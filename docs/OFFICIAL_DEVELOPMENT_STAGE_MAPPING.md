# Official Development Stage Mapping

Status: audit correction record  
Master rule: the immutable development plan owns stage numbering. GitHub PR numbers and historical PR titles are implementation evidence, not the master numbering source.

## Immutable stage boundaries relevant to this correction

- Stage 6: Internal Solver — official slots 6/1 through 6/5 only.
- Stage 7: Solver Network / Risk — official slots 7/1 through 7/8 only.
- No official 6/6 slot exists.

## Historical GitHub reclassification

The following code is retained exactly as merged. Its historical PR title is not rewritten because Git history is audit evidence.

| Historical label | PR | Merge commit | Implemented capability | Official classification |
|---|---:|---|---|---|
| 6/1 | #155 | c722c79835b2f26b3c7128151d4c8ec493cfc425 | Solver Registry, bond, exposure | Stage 7 Solver Network / Risk; exact 7/x pending master-slot reconciliation |
| 6/2 | #156 | 4b2147714051c6501efd5f4c2184c8d66ee5d6a7 | Reputation, eligibility | Stage 7 Solver Network / Risk; exact 7/x pending master-slot reconciliation |
| 6/3 | #157 | ecef5a9c554712c8dec5c509d8d736acf93f8a5f | Best Execution Score | Stage 7 Solver Network / Risk; exact 7/x pending master-slot reconciliation |
| 6/4 | #158 | 781632be043b6722dc75a03b00f18de59e4186a5 | Solver assignment / intent binding | Stage 7 Solver Network / Risk; exact 7/x pending master-slot reconciliation |
| 6/5 | #159 | 2b5b0c67632f7377931b9a01ec004fd10d0ab3ed | Execution verification | Stage 7 Solver Network / Risk; exact 7/x pending master-slot reconciliation |
| 6/6 (invalid official slot) | #160 | not merged at correction time | Verified-result reputation feedback | Stage 7 Solver Network / Risk; PR title corrected before merge |

## Audit rules

1. Never delete or rewrite merged commits to repair stage labels.
2. Never invent an additional official slot.
3. A feature may be developed early, but completion credit belongs to its official master-plan slot.
4. Stage 6 Internal Solver 6/1-6/5 must be independently gap-checked; Stage 7 work does not imply Stage 6 completion.
5. Exact 7/1-7/8 assignments must be taken from the immutable master definitions, not guessed from implementation order.
6. Whitepaper status is capability-based (Implemented / In development / Planned); detailed PR-to-slot evidence lives in GitHub documentation.
7. Completion claims require code, tests, CI evidence, and the exit evidence required by the official slot.

## Current correction state

- Stage 5 Core Intent implementation remains preserved.
- Solver Network/Risk capabilities were developed ahead of final official numbering reconciliation.
- PR #160 is intentionally not merged under a 6/6 label.
- Next action: reconcile the exact immutable definitions of 6/1-6/5 and 7/1-7/8, then gap-check Stage 6 and pin every Stage 7 capability to its exact official slot.


## Exact immutable slot definitions

### Stage 6 — Internal Solver
- 6/1 Router 2.0 → Internal Solver
- 6/2 Intent → Solver
- 6/3 Escrow → Router Execution
- 6/4 Execution Receipt
- 6/5 BSC Same-chain Intent E2E

### Stage 7 — Solver Network / Risk
- 7/1 SolverRegistry
- 7/2 SolverBond
- 7/3 Stablecoin/LQC Bond
- 7/4 Exposure/Capacity
- 7/5 QuoteManager
- 7/6 Solver Competition
- 7/7 Risk-adjusted Best Execution
- 7/8 Reputation

## Exact capability reconciliation

| Existing evidence | Official slot(s) | Status |
|---|---|---|
| PR #155 Solver Registry / bond / exposure | 7/1, partial 7/2, partial 7/4 | Implemented foundation; split-slot acceptance still requires exact slot gates |
| PR #156 Solver Reputation / eligibility | 7/8 | Implemented foundation |
| PR #157 Best Execution Score | 7/7, partial 7/6 | Implemented foundation |
| PR #158 Solver Assignment / intent binding | 7/6 support | Implemented support primitive |
| PR #159 Execution Verification | 7/7 risk evidence | Implemented support primitive |
| PR #160 Verified result → Reputation | 7/8 | CI passed; pending merge at mapping update |
| Stablecoin/LQC-specific bond policy | 7/3 | GAP |
| QuoteManager | 7/5 | GAP |
| Internal Solver Router 2.0 execution path | 6/1 | GAP / must be verified against repository before completion |
| Intent → Internal Solver handoff | 6/2 | GAP / must be verified against repository before completion |
| Escrow → Router execution | 6/3 | GAP / must be verified against repository before completion |
| Execution Receipt | 6/4 | GAP / must be verified against repository before completion |
| BSC same-chain Intent E2E | 6/5 | GAP / requires integrated evidence |

### Sequencing correction

Stage 7 primitives already implemented are retained as valid early work, but they do not grant Stage 6 completion. Development resumes from the earliest unresolved Stage 6 slot. Stage 7 completion credit is assigned only after each official 7/1-7/8 gate is satisfied.
