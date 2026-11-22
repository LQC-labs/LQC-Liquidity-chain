# 76-17-⑥-⑤ / M08 — HyperSync full-range indexed event observation

Status: **INDEXED RANGE RETURNED / ONE ACCOUNT FOUND / INDEPENDENT COMPLETENESS NOT APPROVED**

## Pinned run

- Research branch head: `3853754df096756fdcaf3dc135876872724e3033` (collector run).
- GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45044850492 (SUCCESS).
- Artifact: `futures-m08-hypersync-bounded-window` (artifact ID `14762664669`).
- Provider: `https://bsc-testnet.hypersync.xyz` using GitHub Secret; secret never printed.
- Chain: BSC Testnet **97**, historical MVP/test-only contracts.
- Start block: **131945356**, end block (inclusive): **144115366**, with HyperSync `to_block=144115367` exclusive.
- HyperSync advanced its page cursor from **131945356** to **144115367** in one successful response; script rejected duplicate `txHash:logIndex` identities and malformed unexpected events.
- Returned matching account-discovery events: **5**, distinct accounts: **1**.
- Engine: `0xe4f1320c8709631776c7e39e0916584935882525`.
- Vault: `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`.
- Account found: `0xde05e09db1292aff6ab62164134f1ad384bca6fb`.

## Five events (provider response)

| Block | Contract | Event | Tx |
| --- | --- | --- | --- |
| 131978250 | Vault | Deposit | `0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1` |
| 131980821 | Vault | CollateralLocked | `0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4` |
| 131980821 | Engine | PositionOpened | same tx as CollateralLocked |
| 131984084 | Vault | CollateralUnlocked | `0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19` |
| 131984084 | Engine | PositionClosed | same tx as CollateralUnlocked |

## Scope and reservations

**Confirmed:** the indexed provider returned a contiguous cursor for the requested range, and the two known transaction anchors are present. No other indexed events of the selected account-discovery event types were returned for the specified Engine/Vault addresses in this response.

**Not established:** cryptographic proof of provider historical retention, independent receipt-by-receipt comparison for all log entries, the exact two contract-creation block lower bounds, block hash anchoring of this particular request, or independently attested completeness of every user. The `coverageComplete` field in the raw collector refers to the requested **cursor range**, not verified economic migration completeness.

Earlier *separate* pinned observation at block 144115366 showed the known account `positions(account,1).open=false`, `lockedBalance=0`, `availableBalance=5000 mUSDT` and aggregate Vault `totalAccounted=5000 mUSDT`; these are not a same-run response to the HyperSync query. A final M07 PASS requires authenticated same-block reconciliation and independent reviewer acceptance.

**M08 migration gate: BLOCKED.** No live `setEngine`, no assets, no new deployment, no PR #460 modification.

## Next independently testable requirements

1. Independently confirm both deployment receipt block numbers and that range 131945356 starts no later than the first deployment.
2. Cross-check all five logs against transaction receipts using a different read source.
3. Re-query `positions`, `availableBalance`, `lockedBalance`, and `totalAccounted` at a single frozen verified block hash; compare to token `balanceOf(Vault)`.
4. Feed attested account/market inventory into the M07 offline preflight and retain BLOCKED on any unknown or unenumerated obligation.
