# 76-17-⑥-⑤ / M08 — Complete indexer strategy and gap-proof gate

Status: **COLLECTOR SOURCE NOT VERIFIED / COVERAGE GATE IMPLEMENTED / MIGRATION BLOCKED**

## Historical anchors (BSC Testnet chainId 97)

- Historical Engine: `0xe4f1320c8709631776c7e39e0916584935882525`
- Historical Vault: `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`
- First documented account and lifecycle: `docs/research/FUTURES_76-17_M08_FIRST_POSITION_LIFECYCLE.md`
- Previous M08 pinned block: 144115366; the full event interval from contract creation to the snapshot was **not collected**.
- The observed historical contract ABI has PositionOpened, PositionClosed, PositionLiquidated and positions(account,marketId); the historical Engine does not provide the later openInterestUsd getter or later Funding ledger functions.

## Indexed log collection requirement

Obtain a documented, reliable, **historical BSC Testnet (97)** indexer with pageable contract-address logs. Blockscout-compatible `/addresses/{address_hash}/logs` describes paginated logs; Etherscan V2 also documents `chainid=97`. Neither guarantees that a particular provider has complete historical data for these LQC contracts. Before selecting a provider, validate actual API availability and retention, authentication requirements, pagination, and source/provenance terms. Do not embed paid API keys in repository files or CI logs.

The source must provide:

1. Engine and Vault event logs from **each contract's verified contract-creation block** to one common, confirmed block number/hash.
2. Stable pagination until the provider reports exhaustion, with a saved response/query cursor and page count; no guessed offsets, arbitrary top-N truncation, or unsupported sort assumptions.
3. Original block numbers, transaction hashes, log indices, emitting contract addresses, topics, and data (to cross-check receipts independently).
4. Error handling for rate limiting, skipped pages, reorgs, unavailable historical ranges, empty pages with a continuation cursor, and duplicate events.
5. A per-contract contiguous coverage manifest: from/to, source identifier, successful/truncated status, log count, request reference. A snapshot hash alone is not proof of page completeness.

## Offline acceptance

Run `node scripts/verify-futures-m08-log-coverage.mjs INPUT.json` over a coverage manifest with the exact documented schema. Its synthetic regression is `node --test test/futures-m08-log-coverage.test.mjs`.

- `COVERAGE_FORMAT_PASS`: structured range continuity is consistent **as reported by the caller**. It cannot authenticate upstream responses or prove full user inventory.
- `BLOCKED`: missing ranges, truncated queries, or reported RPC failure.
- `FAIL`: invalid/wrong chain, addresses, snapshot, overlapping ranges, malformed or duplicate events.
- `inventoryComplete` and `operationalCutoverAuthorized` are **always false**.

## Steps after authenticated collection

Independently verify a sample of log receipts and source completeness, derive unique account/market pairs from Engine and Vault events, perform all `positions(account,marketId)` / `availableBalance(account,token)` / `lockedBalance(account,token)` calls at the same immutable block, and reconcile per-user sums to Vault totals. A zero count with any coverage gap remains BLOCKED. Only then prepare a complete M07 snapshot for an independent review.

## Hard safety boundary

No GitHub Actions polling loops over the chain, no direct transaction submission, signer or secret, no automatic migration, no main merge, no PR #460 mutation, and no claim of production Oracle readiness.
