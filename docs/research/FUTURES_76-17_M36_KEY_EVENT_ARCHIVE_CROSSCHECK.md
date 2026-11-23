# 76-17-⑥-⑤ / M36 — Bounded governance, open and close log comparisons

**Decision: THREE_KEY_EVENT_WINDOWS_MATCH__FULL_HISTORY_BLOCKED.** Real QuickNode + HyperSync comparison PASS for three selected 3-block windows. Production payout/migration remain BLOCKED.

## Exact evidence
- Candidate code: `dex/scripts/verify-futures-m36-key-event-windows.mjs`
- Seven focused regression tests: `dex/test/futures-m36-key-event-windows.test.mjs`
- GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45112491379 — SUCCESS; 7 PASS / 0 FAIL; artifact `futures-m36-key-history`, ID `14789614893`.
- Both existing repository secrets used inside a credential-redacted, read-only CI job: `M32_QUICKNODE_BSC_TESTNET_RPC_URL` for QuickNode, `ENVIO_API_TOKEN` for HyperSync. **9 total outbound HTTP requests**, hard maximum 9. No endpoint URI or secret-bearing errors in output.
- BSC Testnet chainId 97, historical Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`, historical Engine `0xe4f1320c8709631776c7e39e0916584935882525`.
- Data scope: all Vault + Engine events in each precisely bounded 3-block window, queried from one HyperSync indexer page and two QuickNode direct `eth_getLogs` calls per window.
- Comparison includes address, transaction hash, block number, log index, topics array and data bytes. Known anchor event's topic0, contract address and log index also verified. Independent full global history is *not* implied.

## Actually compared historical windows

| Anchor event | BSC Testnet center block | Full queried interval inclusive | Logs returned by each source | Exact normalized SHA-256 for BOTH providers |
|---|---:|---|---:|---|
| CollateralSupportChanged | 131970723 | 131970722–131970724 | 1 | `00f62b202928258e424fb4d8b6d3ab95c7c4e62641839fae748dbd449379adf8` |
| PositionOpened / collateral locked | 131980821 | 131980820–131980822 | 2 | `1a31bc0051c429b094356bc92b775c705cbb7c39c9162d13bdb23fbf972ba80a` |
| PositionClosed / collateral unlocked | 131984084 | 131984083–131984085 | 2 | `bb6f79b0d361bb6be83c15f8eb0ae27d2a3fafd9bdb19e3da64d33bb51c1d2b1` |

- Across all three intervals, indexerCount=quicknodeCount=matchedCount, with zero missing or unexpected records and zero source errors.
- M35 earlier verified one separate 3-block interval including the historical 5,000 mUSDT Deposit; current M36 verified separate governance and position lifecycle windows.
- Seven M36 fixture tests cover exact match, forged topic/data mismatch, one-sided missing/extra event, duplicate log identity, secret absence yielding zero requests and incomplete indexer range rejection.

## Critical limitations
- **Not 12,170,327-block independent coverage**: M36 adds only 9 selected blocks in three narrow windows; it cannot prove absence of unknown transactions elsewhere.
- Token Transfer events were not the comparison target in M36; M35 independently compared the historical deposit's token Transfer and Vault Deposit with original byte values.
- M08–M29 preserve one known user's 5,000 mUSDT withdrawal-right accounting at block 144115366, but do not establish full global account/asset inventory.
- All QuickNode calls were reads, and outputs are SHA-256 of normalized returned log content rather than cryptographic proofs of a provider's complete historical retention or source economic independence.
- Full range or sampled findings cannot be promoted to legal ownership, economic title, protocol-owned surplus or approval to transfer old user assets. Full historical inventory, independent security/audit and M07 migration remain BLOCKED.
- M14 new on-chain stack acceptance remains NOT_RUN; PR #460 stays separate Draft/unmerged.

## Recommended next action
Progress to M37 by deciding an explicit, cost-constrained plan to verify large independent historical ranges without excessive RPC usage. Use the prior M29 full-range HyperSync evidence as an index, and compare QuickNode history through a bounded archival strategy with an approved credit/call budget. Never infer global completeness from a few successful sample windows. Do not launch thousands of unapproved calls against the expiring paid provider.

**No change to canonical Engine/Vault, historical user token balances, `main`, PR #460, wallet signatures, deployments or governance state.**
