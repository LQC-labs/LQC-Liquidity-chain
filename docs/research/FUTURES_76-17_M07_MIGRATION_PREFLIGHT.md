# 76-17-⑥-⑤ / M07 — Futures Engine migration preflight gate (research draft)

Status: **DESIGN / BLOCKED**. This is a read-only, fail-closed acceptance specification. It does **not** authorize `setEngine`, migration, Governance signatures, or live asset transfers.

## Pinned evidence

- Research-branch source derived from PR #460 candidate head `42fb30262f581a772a88d5385199cb58e5ef575b`.
- M02–M03 isolated Foundry workflow: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/44931246408 (SUCCESS).
- M04–M06 isolated Foundry workflow: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/44961877537 (SUCCESS).
- PR #460 remains a separate Draft; do not merge research results into it by implication.

## Confirmed implementation constraints

1. `LQCFuturesVault.setEngine(address)` checks only `onlyOwner` and a nonzero new address; it **does not** assess positions, Funding ledgers, Vault solvency, or rollback readiness.
2. `LQCPerpEngine.positions(account,marketId)`, `fundingLedgers(account,marketId)`, and `positionFundingEntryRay(account,marketId)` are stored in the **Engine**, not in the Vault. A new Engine starts without those values.
3. Market `openInterestUsd(marketId)` is stored in the Engine. The global OI can be zero while unrelated Vault collateral, reserves, closed Funding credit/debt, or unresolved `residualBadDebt` remain.
4. The public mappings are not enumerable by themselves. Events plus a trusted, complete address/market inventory and on-chain reads must be cross-checked; a partial log inventory is insufficient proof of zero obligations.
5. `finalizeClosedFunding(uint256)` currently always reverts with `ClosedFundingSettlementBlocked`. Zero open positions therefore does **not** prove that Funding claims/debts were disposed of.

## M07 fail-closed preflight requirements

Freeze a consistent chain-specific snapshot at a finalized/canonical block. Record `chainId`, block number/hash, Registry/Engine/Vault/token addresses, bytecode hashes, market IDs, asset decimals, all authorized account addresses, and the source of account discovery. Do not sign or submit transactions during discovery.

- **G01 — Completeness:** obtain a reconciled, independently reviewable user and market inventory from deployment origin through the snapshot; missing historical logs, unknown upgrades, or partial RPC coverage => **BLOCKED**.
- **G02 — Positions and OI:** each enumerated `positions[user][market]` must be closed **or** there must be an independently verified atomic migration implementation. Sum of open position notionals must reconcile with each market's `openInterestUsd`; mismatch => **BLOCKED**.
- **G03 — Funding:** retain global `fundingStates`, per-user `positionFundingEntryRay`, `recognizedNetUnits`, `activeRemainderRay`, `closedCreditRay`, and `closedDebtRay`; unresolved credits/debts or missing disposition policy => **BLOCKED**.
- **G04 — Vault and reserves:** reconcile `availableBalance`, `lockedBalance`, `totalAccounted`, `fundingPoolBalance`, `insuranceFeeReserve`, `treasuryFeeReserve`, `residualBadDebt`, `totalInsuranceCovered`, and actual token balances. `isFullyBacked` and `isSolvent` are helpful checks, **not sufficient by themselves** to approve migration.
- **G05 — No unauthorized mutation:** before/after snapshots must match all non-migrated obligations; no duplicate payouts, loss of user withdrawals, or resetting accounting to make a test pass. Explicit governance review is necessary for any nonzero debt, open claims, or asset transfers.
- **G06 — Cutover/rollback:** document who may execute `setEngine`, the exact planned immutable source and target addresses, a time-bounded rollback plan, and a local failure-recovery test. M06 demonstrates restoring the pointer in isolation, **not** that rollback is universally safe, especially after writes on the replacement Engine.
- **G07 — Operational safety:** independent review, production Oracle/proxy provenance, and downstream integration/authorization validation are required before any mainnet deployment or cutover.

## Acceptance matrix

| Scenario | Expected result today | Evidence |
|---|---|---|
| M02: open Long/Short + Engine pointer switch | old Engine retains positions, new Engine empty; old settlement fails | isolated Foundry SUCCESS |
| M03: pending Funding + pointer switch | obligations retained in old Engine, not imported to replacement | isolated Foundry SUCCESS |
| M04: partial liquidation + pointer switch | partial position/OI/Vault persist in old storage, no import | isolated Foundry SUCCESS |
| M05: Insurance/Treasury/bad debt + pointer switch | existing reserve/debt values persist; not a debt cure | isolated Foundry SUCCESS |
| M06: restore pointer before replacement writes | old Engine authorization can be restored under tested fixture | isolated Foundry SUCCESS |
| M07: complete, independently reconciled preflight | **BLOCKED** until G01–G07 evidence and approved migration/exit policy exist | NOT_RUN / design only |

## Safe next implementation candidate

An **offline / read-only snapshot verifier** that consumes explicitly provided, independently collected block-pinned JSON, checks schema, uniqueness, completeness attestations and invariants, emits PASS/FAIL/BLOCKED, and never connects to an RPC or performs a transaction. Its output cannot by itself prove the supplied inventory was complete. Design and test this verifier in the research branch before considering any contract modification.

## Non-goals

No live Engine replacement, no account discovery by guessed keys, no storage slot writes, no forced position settlement, no private keys, no deployment, no main merge, and no automatic approval of PR #460.
