# Master 3/7 — Best Execution Determinism Gate

Status: implementation gate
Base: 56421d26910fa437fa3f04feff055c6431d1ee7b

## Purpose

Master 3/7 makes Router 2.0 Best Execution selection deterministic and reproducible for an identical normalized candidate set.

The gate is verification-only. It does not authorize a swap, wallet signature, transaction broadcast, deployment, liquidity mutation, or production activation.

## Canonical selection rules

1. Reject incomplete, non-finite, negative, stale, wrong-domain, or unapproved-adapter candidates.
2. Normalize economic values to integer base units before comparison.
3. Rank candidates by:
   - highest net output after explicit fees/costs;
   - lowest explicit execution cost;
   - lowest risk score;
   - lexicographically smallest stable route identifier as the final tie-break.
4. Candidate input order must never change the selected route or proof input.
5. Any ambiguous or invalid normalized candidate set fails closed.
6. DEX/Flow selection must not consume Futures, Lending, or Intent execution state.

## Output boundary

The evaluator emits a deterministic selection result and canonical selection digest input. It does not execute the route.

`activationAuthorized: false`

Master 3/7 PASS means only that Best Execution selection is deterministic under the declared comparison policy.
