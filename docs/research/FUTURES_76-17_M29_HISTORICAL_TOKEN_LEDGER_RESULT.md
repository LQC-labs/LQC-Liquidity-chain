# 76-17-⑥-⑤ / M29 — Historical ERC20 Transfer / Vault cash and ledger reconstruction

**Decision: INDEXED_TRANSFERS_RECEIPTS_RECONCILED__GLOBAL_PROVENANCE_BLOCKED. Historical known-account rights preserved. No distributable surplus or migration approval.**

## Frozen range and independent known anchors

- ChainId 97, BSC Testnet.
- Historical Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`, deployed in **block 131945040**.
- Mock test mUSDT token `0x7ab1b97d194730e9456c12af7905450a4f8a0c46` (18-decimal units).
- Account `0xde05e09db1292aff6ab62164134f1ad384bca6fb`.
- Frozen block **144115366**, hash `0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208`.
- Inclusive scan [131945040,144115366], exclusive upper bound 144115367; M08 fixed known-user balance and M28 independently identified transfer/Deposit receipt are unchanged.

## M29 real read-only process and evidence

- Collector `dex/scripts/collect-futures-m29-full-token-history.mjs` queries *all Transfer events of the selected mUSDT token* and all Vault logs over the pinned historical range with the existing HyperSync bearer token (secrets never exposed), then filters Transfer endpoints involving the historical Vault.
- Queries are bounded with a page and log cap, reject missing progress/partial range, and compare each returned relevant receipt log identity (tx, log index, contract address and block) against a separate public BSC Testnet RPC source. A further historical RPC read checks `totalAccounted(token)`, `token.balanceOf(Vault)`, `availableBalance(knownUser,token)`, `lockedBalance(knownUser,token)` at the fixed block.
- Final validated Actions run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45085167705 — SUCCESS.
- Artifact name: `futures-m29-historical-token-transfer-evidence`, JSON emitted by the collector. The final run includes token and Vault logs and receipt-verified event identities. First run https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45084967846 also confirmed the amounts and range but correctly kept BLOCKED for one then-unrecognized Vault topic.
- The unknown topic from block 131970723, tx `0x7a1e7681d44716fb1d662fe9a733adf3285bda5432bcbd64582b74ed5993b3c7`, log index 19, was then decoded as **CollateralSupportChanged**, a collateral management event rather than cash movement. The final collector result shows **zero** unrecognized Vault topics.
- Relevant Vault token movements: **one ERC20 Transfer into Vault, zero transfers out**, total incoming `5000000000000000000000` units, outgoing `0`, net incoming `5000000000000000000000`. This equals both frozen ERC20 actual balance and Vault total accounted at 144115366.
- One Vault `Deposit` (5,000 mUSDT) matches ERC20 Transfer within tx `0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1`. No unmatched amount-bearing Vault Deposit/Withdrawal accounting events or unattributed Vault-relevant token transfers were returned.
- Six Vault log events in scope: OwnershipTransferred, EngineChanged, CollateralSupportChanged, Deposit (5,000 mUSDT), CollateralLocked (1,000 mUSDT), CollateralUnlocked (1,000 mUSDT). The last two are **internal available/locked movements**, not outgoing ERC20 transfers. Event content was independently matched to relevant RPC receipt identities.
- One known account discovered in Vault account-event logs. This is a statement about **returned indexed logs for this particular Vault/token/scope**, not independent proof that all users, collateral tokens, silent ledger mutations or untracked obligations are captured.
- At M08 fixed block the known user's available is 5,000 mUSDT and locked is 0. Physical Vault balance = totalAccounted = 5,000 mUSDT; observed physical excess = 0.
- Source/protocol entitlement fields stay `fullHistoricalInventoryComplete:false`, `independentGlobalCompleteness:false`, `protocolOwnedSurplus:"0"`, `payoutAuthorized:false`. The returned full-range HyperSync cursor is indexer coverage, **not** cryptographic evidence of global completeness.
- M28 earlier focused offline tests https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45061316347 previously 9 PASS / 0 FAIL; these were not needlessly repeated for M29.

## Security, economics and next decision

1. **The full token Transfer and Vault event query is not a universal asset-inventory proof.** It covers this selected token and historical Vault, in an indexer's bounded range, with receipt checks only for returned items. Missing events from an incomplete provider could evade receipt checking. Truly independent historical log coverage of token and Vault, multi-provider pinned hash verification, and full token/other collateral list are not yet complete.
2. The historical MVP lacks modern Funding and Insurance reserve getters; do not assign them zero or fabricate modern ledger fields.
3. No authorized transfer or use of historical 5,000 mUSDT is implied. That balance is exactly matched to user withdrawal accounting; do not treat it as distributable protocol profit.
4. Ownership of hypothetical unsolicited donations, realized losses, all-user rights, FX claims, and M27 positive-review budget governance remain unproven.
5. A review cannot make a real payout until legal/economic entitlement, historical claim completeness, live contract provenance, independent security review, Safe authorization and current real-time Oracle controls are separately approved.
6. M07 migration and M14 newly deployed stack remain BLOCKED/NOT_RUN. PR #460 remains separate Draft/unmerged. No main merge, historical Vault `setEngine`, live contract deployment, wallet signature, approval transaction or actual token movement occurred.

**Recommended next work:** narrowly compare complete historical token Transfer and Vault logs through one genuinely independent RPC or a second independently operated indexed archive, using the same frozen block hash and decoded event/receipt identities. If RPC retention or provider caps prevent full independent coverage, record the exact range as BLOCKED rather than claiming global completeness.
