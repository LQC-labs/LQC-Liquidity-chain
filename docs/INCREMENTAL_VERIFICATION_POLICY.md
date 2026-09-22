# LQC Incremental Verification Policy

Status: **ACTIVE — repository execution rule**

Purpose: preserve the existing safety standard while eliminating repeated verification of unchanged, already-proven areas.

## 1. Verified baseline reuse

A module that already has a recorded PASS on the current dependency line is treated as the baseline. Do not restart its architecture review, file inventory, or historical evidence search unless a new change touches that module or one of its declared dependencies.

## 2. Change-scope first

Every development step begins with the current `main` commit and the actual changed-file set. Classify changes into:
- direct module changes;
- shared dependency changes;
- documentation/evidence-only changes.

Only the affected validation lanes run before merge.

## 3. Focused PR validation

During implementation, run:
- compile;
- changed-module unit/integration tests;
- the smallest security/invariant set that covers the changed dependency boundary.

Do not run every historical Master workflow on every PR.

## 4. Dependency-aware regression

Expand validation only when the change touches a shared boundary. Examples:
- Futures Engine change → Futures Engine/Vault/Oracle/accounting regressions;
- Oracle interface change → every active Oracle consumer;
- shared token transfer library change → every active custody module.

Unchanged isolated modules are not re-tested merely because they exist in the repository.

## 5. Historical workflows are evidence, not automatic CI

Completed Master/Stage workflows are preserved under `.github/workflow-archive/completed/`. They no longer trigger automatically. They can be restored or replayed deliberately when audit, incident review, or dependency changes require them.

## 6. One focused workflow for the active substep

The currently active development substep may have one focused automatic workflow. When that substep is merged and credited PASS, retire/archive that workflow instead of allowing it to accumulate as a permanent automatic trigger.

## 7. Broad regression is non-blocking during iteration

Full DEX/system regression is not a prerequisite for every intermediate commit. The PR is gated by focused validation. A broad `npm test` regression runs after merge on `main` and at explicit integration/security milestones.

## 8. Mandatory final full regression

Broad/full regression remains mandatory at:
- the end of a multi-substep gate such as 7/5-7;
- current-release Testnet E2E such as 7/7;
- Master 12 Full BSC Integration;
- Master 13 Security/Audit gates;
- any change that materially alters shared Core behavior.

This policy reduces duplicate validation, not validation quality.

## Operational consequence

The repository keeps only the small current CI surface active. Historical workflows and evidence remain reproducible but do not consume GitHub Runner time during unrelated development.

`safetyStandardReduced: false`
`duplicateVerificationReduced: true`
