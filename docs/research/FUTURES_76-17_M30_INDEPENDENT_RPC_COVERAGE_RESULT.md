# 76-17-⑥-⑤ / M30 — Independent BSC Testnet RPC historical validation

**Result: INDEPENDENT_KNOWN_RECEIPTS_PASS__FULL_RANGE_BLOCKED. No payout, no historic Vault migration, and no claim of complete account enumeration.**

## Source and execution evidence
- Research branch: `research/futures-m02-m03-isolated`.
- Read-only script: `dex/scripts/verify-futures-m30-second-provider.mjs`.
- Focused workflow: `.github/workflows/futures-m30-second-rpc.yml`.
- Final GitHub run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45085737415 — CI **SUCCESS**, but source-verification result **PARTIALLY VERIFIED / FULL_RANGE BLOCKED**. Artifact name `futures-m30-independent-rpc-evidence`.
- First probe: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45085630847 — established independent receipts but got pruned historical state and other provider failures. Refined script now preserves partial independent receipt facts and attempts independent historical log queries separately.
- BSC Testnet chain ID 97.
- Scope: original M08/M29 historic Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`, token `0x7ab1b97d194730e9456c12af7905450a4f8a0c46`, history inclusive **131945040–144115366**, frozen hash `0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208`.
- Independent operators requested (not the earlier PublicNode endpoint or HyperSync): BNB Chain official Testnet RPC `https://bsc-testnet-dataseed.bnbchain.org` and dRPC `https://bsc-testnet.drpc.org`. BNB Chain documents the official endpoint; operator identity itself is not a proof of archive retention.
- No credentials or private key supplied or read. No `eth_sendRawTransaction`, signer, asset transfer, `setEngine`, contract deployment, PR #460 change or main merge.

## What the second provider independently confirmed

The BNB Chain official RPC responded successfully to chain-id and frozen block-hash reads and provided **7/7 exact receipt event matches** from historical known transactions. These event identities include:
- Vault `OwnershipTransferred`, `EngineChanged`, `CollateralSupportChanged`.
- Vault `Deposit` for 5,000 mUSDT, `CollateralLocked` for the historical position, `CollateralUnlocked` after close.
- ERC20 `Transfer` of 5,000 mUSDT from the known user to the historical Vault in the same deposit transaction.

The known historical deposit transfer and deposit event amounts and participants were checked at receipt level. This corroborates M28/M29 **known events**, not the absence of additional events.

## Exact blockers found

1. BNB Chain official RPC: frozen `eth_call` historical balance-state reads returned `missing trie node`. This is consistent with unavailable/pruned archive state; it does **not** prove the M08/M29 balances are wrong. M30 `knownUserRightsPreserved=false` represents **not independently reverified here**, not a claim that the existing known 5,000 mUSDT entitlement was removed.
2. BNB Chain official RPC: `eth_getLogs` over the full ~12.17 million block interval returned `limit exceeded` for Vault logs and Vault-related token transfers. Even **three-block Vault probes** returned `limit exceeded`. A returned RPC error is not equivalent to an empty successful log response.
3. dRPC: chain ID and frozen block hash matched, but known transaction receipt retrieval failed / timed out, so this source did not reach ledger or independent full-range log confirmation.
4. Because no independent provider supplied successful historical `eth_getLogs` for the entire frozen interval, `completeSecondProviderCoverage=false`. M29's HyperSync continuous cursor and RPC receipt crosschecks are valuable but **not** an independently established full-history log inventory.

## Current acceptance state

| Claim | Status |
| --- | --- |
| M29 known historical ERC20 net inflow 5,000 mUSDT | PRIOR M29 EVIDENCE PASS |
| M30 independent frozen block hash | PASS on two operators |
| M30 independent known event receipt identities | 7/7 PASS on BNB official RPC |
| M30 independent frozen Vault user balances | BLOCKED (historical state unavailable) |
| M30 independent full-range log inventory | BLOCKED (RPC log limits and other source errors) |
| Globally complete asset/claim inventory | BLOCKED |
| Distributable protocol-owned balance | **0 proven**, no authorization |
| Historic Vault move, main merge, PR #460 modification | NOT EXECUTED |

## Technical conclusion / next productive decision

**Do not repeat full-range requests against endpoints already shown to reject even tiny log windows.** Progress needs one of: a genuinely independent archival/indexing provider with approved historical retention and `eth_getLogs` or indexed query coverage, a validated historical evidence export from an independently operated explorer/archive, or a securely configured archival full node that can serve the entire range and pinned historical state. When available, compare full event IDs and token movement amounts to the M29 frozen results, and prove block-hash and source independence. Distinguish complete provider responses from external attestation and ultimate economic-title authorization.

Absent such a source, **M30 remains independent known-receipt PASS / full-range verification BLOCKED**; M07 migration and production payout remain BLOCKED. Historical 5,000 mUSDT known-user rights remain protected under M08/M29 evidence.
