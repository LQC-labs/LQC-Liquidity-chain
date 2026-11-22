# 76-17-⑥-⑤ / M31 — Independent archive feasibility and export verifier

**Decision: independent archive export verifier 8 PASS / 0 FAIL (offline synthetic); NO independent provider export acquired. M30 full historical completeness remains BLOCKED; payout and migration remain BLOCKED.**

## Fixed historical scope and carried evidence

- Research branch: `research/futures-m02-m03-isolated`.
- Original chain: BSC Testnet 97; Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`; known mUSDT token `0x7ab1b97d194730e9456c12af7905450a4f8a0c46`.
- Frozen block **144115366**, hash `0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208`.
- Vault deployment from **131945040**; inclusive historical scope spans **12,170,327 blocks**.
- M29 HyperSync indexed full-range query + PublicNode receipt matching returned **six** Vault logs and **one** ERC20 Transfer relevant to historical Vault; 5,000 mUSDT inbound, 0 outbound, known account's frozen 5,000 mUSDT available balance, 0 locked, physical Vault balance equal to accounted. One collateral support toggle is a governance event, not a token transfer.
- M30 BNB Chain official RPC separately verified the pinned hash and 7/7 known log receipts but failed historical `eth_call` with `missing trie node`, and `eth_getLogs` with `limit exceeded` even for small probes. dRPC did not provide all known receipts. **Neither source independently provided the entire range.**
- Thus all physical surplus/economic rights remain **0 proven**, no payout entitlement, no migration authority, no authorized new deployment.

## External provider feasibility (public documentation, not live account validation)

1. **QuickNode BSC Testnet archive candidate** — QuickNode BNB Smart Chain documentation explicitly lists chainId **97**, archive **Yes**, pruning **None**, and offers historical data/streams. This supports technical feasibility, but does **not** prove a chosen endpoint, subscription tier, exact M08 historical availability, acceptable query limits, or operational independence for LQC. Sources: https://www.quicknode.com/docs/bnb-smart-chain and https://www.quicknode.com/chains/bsc
2. **Alchemy BNB Testnet candidate** — Alchemy's BSC Testnet RPC page advertises private RPC and archive access with a key; its `eth_getLogs` limits depend on plan and chain. Exact historical retention and availability must be *empirically tested* before acceptance. Sources: https://www.alchemy.com/rpc/bnb-testnet and https://www.alchemy.com/docs/chains/bnb-smart-chain/bnb-smart-chain-api-endpoints/eth-get-logs
3. **BNB Chain Reth BSC Testnet archive snapshot** — official `bnb-chain/bsc-snapshots` README lists a 2026-10-02 BSC Testnet archive MDBX snapshot of **482.52 GB compressed**. This is a self-hosting alternative, not a lightweight JSON/CSV export or a ready-to-query service; additional disk, compatible node, installation and historical-state verification are required. Source: https://github.com/bnb-chain/bsc-snapshots . Avoid proposing local download for this narrow evidence issue unless separately funded and approved.
4. **BscScan/Etherscan API V2** supports BSC Testnet chainId **97**, event log APIs and account token transfer queries, but authorization, quotas, historical data limits and absence-of-logs completeness require separate testing; an API key may be needed. Source: https://bscscan.com/api

**Current choice:** Prefer a separately operated authenticated BSC Testnet archive endpoint that can serve the fixed block and chunked `eth_getLogs` over an immense self-hosted snapshot. Do not fabricate endpoint URLs or assume an API key has been configured. Secrets must be kept in an environment secret store, never committed to Git or printed in logs.

## M31 deliverables and observed CI

- Pure offline archive export verifier: `scripts/verify-futures-m31-archive-export.mjs`.
- Targeted Node tests: `test/futures-m31-archive-export.test.mjs`.
- GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45086113168 — **8 PASS / 0 FAIL**.
- It requires a `lqc-m31-archive-log-export-v1` structured export with exactly three filters: all Vault events, known-token ERC20 Transfers *from* Vault, known-token ERC20 Transfers *to* Vault; for each, a sorted contiguous set of nontruncated block windows covering **[131945040,144115366]** with event identities, topics decoded to known names and amounts where applicable.
- It rejects gaps, overlaps, truncated/failed windows, duplicate log identities, missing expected M29 identities, additional unexpected events and known-deposit amount/account mismatch. Eight synthetic negative and positive test scenarios passed.
- Passing the export shape is only `INDEPENDENT_EXPORT_FORMAT_AND_EVENT_SET_MATCH__AUTHENTICITY_BLOCKED`. It **never** marks `independentProviderProven`, `globalClaimCompleteness`, `payoutAuthorized` or `migrationAuthorized` true, because submitted JSON and `success` flags are only assertions, not cryptographically authenticated provider data.
- The synthetic export in tests is not evidence from any live independent archive. M31 did **not** query an authenticated independent archive or run 3,000+ unpaid RPC requests against public endpoints.
- The M31 scope covers the particular old Vault and one known token, not other token contracts, undocumented liabilities, legal title or contemporary operating readiness.

## Efficient next execution gate

- Confirm a genuinely independent provider, BSC Testnet chainId 97, fixed historical block hash, independent receipt access and a small successfully returned historical `eth_getLogs` at the known Deposit block.
- Confirm historical `eth_call` state availability separately from log history; missing trie state is distinct from failed log indexing.
- Establish permitted historical query window size, rate and billing. At 10,000 blocks maximum this interval needs at least **1,218 chunks for each queried filter**, or **3,654 separate filter requests** for all three streams, absent a stronger batch/indexer export. Do not automatically flood a public RPC with such requests.
- Acquire/retain signed or auditable raw exporter responses and block hashes for each range, verify response chain/source independence, then feed the complete normalized independent export into the M31 verifier and compare to M29 receipts. Partial ranges should remain explicitly BLOCKED, not masquerade as empty logs.
- An independent global on-chain event match alone is *still* insufficient for economic surplus ownership, Safe authorization, full token universe, or M07 migration.

**Source, code and chain safety:** PR #460 retained Draft/unmerged, canonical Futures contracts and `main` unchanged; no signer, token movement, deployment, historic Vault `setEngine` or user asset reallocation.
