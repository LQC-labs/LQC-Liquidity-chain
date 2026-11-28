# SYSTEM-E2E-32 stage 105 — independent review delta

Review base: stage 104 source manifest and compiled artifacts. The only stage 105 production source edit is LQCSourceEscrow.sol. SignedIntentEscrow inherits both refund paths. The full Solidity candidate was rebuilt under the pinned settings and ABI / storage layout was compared for the relevant contracts. FundingMath's separately compiled artifact is 1,885 bytes in both candidates; the existing 1,875-byte figure refers to the module embedded by the size-optimized Futures Engine build.

## Refund defect and Router impact

The funded SourceEscrow previously accepted a successful ERC-20 transfer return even when the user received less than the amount of the claim. The fixture reproduces a 1% haircut after a full deposit. Both owner cancellation and public expiry now require exact escrow debit and exact credit to the recorded recipient. Failed transfer rolls back deletion and lifecycle state. A permanently nonconforming token can keep the position pending, which requires an approved recovery policy if a deployed instance contains such a token. No legacy funds or claims were moved.

Competitive signed orders escrow and settle in the same transaction. Cancelling a selected order after failed execution invalidates the QuoteBook request, preserves the previous unconsumed assignment as evidence, and leaves the nonce, receipt, settlement and balances unchanged. No funded escrow exists to refund in that path. Existing early and duplicate restrictions are exercised by the focused tests. QuoteBook rejects nonzero Solver fee by design (explicit submit validation); no fee policy is introduced.

The Router exact input debit and adapter/recipient output reconciliation remains as in stages 103/104. The affected end-to-end route was rerun against rebuilt contracts and the existing known-good real local pool. Continue independent review of cross-contract transfer semantics, same-transaction rollback, immutable wiring and nonce/assignment lifecycle.

## Launchpad and Creator scope

The new local Launchpad scenario exercises separated reviewer and approver, positive Staking Vault eligibility, cap, Guardian pause and a failed-sale refund whose staking balance stays untouched. Prior successful-sale claim/vesting evidence remains applicable to unchanged Launchpad source; no repeat was run.

Creator Vault, Payout Gate and Relay source is unchanged. Reuse stage 92 final-stack evidence for payout hold, stale approval rejection, authorized recovery and exact payout, and the Creator continuity evidence for isolated obligations and unallocated balances. Current source checks dedicated funding, executor authorization, approval/nonce consumption and exact Vault debit and user credit. No new Creator runtime test was run in this stage. Legacy payout liabilities and irreversible retirement evidence remain pending, so migration and live payout activation remain blocked.

No public deployment inputs were added. Independent review has not been executed.
