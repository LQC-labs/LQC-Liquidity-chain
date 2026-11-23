# 76-17-⑥-⑤ / M35 — Independent QuickNode / HyperSync three-block reconciliation

**Status: SELECTED THREE-BLOCK LOGS MATCH (actual source queries); six focused regression tests PASS; full historical inventory BLOCKED.**

## Reproducible evidence
- Research branch: `research/futures-m02-m03-isolated`.
- Collector: `dex/scripts/verify-futures-m35-quicknode-hypersync-window.mjs`.
- Focused tests: `test/futures-m35-small-window.test.mjs`.
- GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45112070331 — SUCCESS; **6 PASS / 0 FAIL** offline negative/positive tests and **successful actual four-request source comparison**.
- Uploaded artifact: `futures-m35-three-block-archive-compare`, ID **14789413156** (available via Actions).
- Existing QuickNode archive secret `M32_QUICKNODE_BSC_TESTNET_RPC_URL` and existing HyperSync `ENVIO_API_TOKEN` read only in protected Actions environment, never logged in JSON evidence or public repository source.

## Strict bounded live scope
- BSC Testnet chain 97; historical Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`, mUSDT `0x7ab1b97d194730e9456c12af7905450a4f8a0c46`.
- Requested exactly 3 blocks [**131978249**, **131978252**) around known M08 Deposit at block 131978250.
- One HyperSync indexer query across the three blocks, plus three QuickNode `eth_getLogs` calls for all Vault logs, token transfers into Vault and token transfers out of Vault. **Four total external HTTP requests**. Bounded count limits and early fail-closed behavior prevent unapproved full-history scanning.
- HyperSync returned **two relevant log records**; QuickNode returned **two matching records** (ERC20 Transfer log 6, Vault Deposit log 7).
- All canonicalized event identities, contract addresses, block numbers, transaction hashes, log indices, topic arrays and raw data bytes were equal. Missing-from-QuickNode and unexpected-on-QuickNode lists both empty.
- Known M08 Deposit account and token address and the 5,000 mUSDT base-unit amount were checked explicitly.
- SHA-256 of sorted normalized relevant logs on both providers:
  `e9a5d9c4110592f38ca3cce41eb8bc0d34f72aa72baf41842c692bb8f3d0224a`.
  This SHA binds the **small-window normalized event bytes**, not independent history completeness, source authenticity, or a canonical chain state root.
- Result `THREE_BLOCK_INDEPENDENT_LOG_BYTES_MATCH__FULL_HISTORY_BLOCKED`, `independentWindowComplete=true`, `fullHistoricalInventoryComplete=false`, `payoutAuthorized=false`. No transaction or signature.

## Precision, scope and security limitations
- Success is **only for the three selected historical blocks**, which include one known user deposit. No conclusion about absent records in the 12,170,327-block total range.
- QuickNode and HyperSync operated as two distinct data sources; source identity and true operation independence need their own attestation before extrapolating from returned logs.
- HyperSync cursor reached the three-block end and all QuickNode filter responses were valid. This proves response-level coverage for the requested small window; it is not cryptographic assurance of source retention beyond that window.
- **Do not count test cases as historical accounts or additional onchain observations**: six tests used synthetic fixtures to reject missing, extra, forged raw event data, wrong amounts, and repeated log IDs.
- No cross-asset accounting, economic ownership, complete historical user inventory, M07 migration or M14 new stack operational acceptance has been established. M08 known-user 5,000 mUSDT right remains preserved by prior pinned evidence.
- No change to PR #460, `main`, canonical Futures Engine/Vault, old BSC Vault `setEngine`, signer, asset ownership, deployment or wallet activity.

## Recommended next engineering decision
Proceed only to a **budgeted and range-bounded proof-of-capability**, not an immediate 12-million-block full-range scan. First agree on a cost/credit ceiling and use `eth_getLogs` in limited windows around key historical events (governance, open/close), comparing full event content with M29. Independently validate source data retention, rate limits, and source auditability before scheduling a complete 3-filter historical reconciliation through M31. Maintain the full-history and economic-title BLOCKED status until truly complete independent evidence exists.
