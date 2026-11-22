# 76-17-⑥-⑤ / M28 — Historical Vault source-of-funds reconciliation

**Status: M28 offline tests 9 PASS / 0 FAIL; real known deposit ERC20 Transfer / Vault Deposit receipt MATCHED; full economic asset provenance and any payout authorization BLOCKED.**

## Frozen M08 source and actual observation

- Original frozen source: `test/fixtures/futures-m08-frozen-observation.json`.
- Chain: BSC Testnet chainId 97.
- Historical Vault: `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`.
- Historical test collateral: `0x7ab1b97d194730e9456c12af7905450a4f8a0c46` (M08 known account used 18-decimal test mUSDT).
- Known account: `0xde05e09db1292aff6ab62164134f1ad384bca6fb`.
- Pinned snapshot block **144115366**, hash `0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208`.
- Earlier M08 indexed observations had five selected lifecycle events and independent receipt comparisons; known user available=5,000 mUSDT, locked=0, no open position, `totalAccounted=actualTokenBalance=5000e18`. They did not supply ERC20 `Transfer` amounts.
- M28 new read-only script `dex/scripts/observe-futures-m28-known-deposit-receipt.mjs` fetched known deposit tx `0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1` on one public BSC Testnet RPC, confirmed pinned snapshot block hash, receipt success, and:
  - Receipt block **131978250**, block hash `0x01b0845e57355ca1ec63f7948bf738cd91b654c0a8c7c1e179ba5e3fdc26aaf5`.
  - ERC20 `Transfer` logIndex **6**, from known account to historical Vault, amount **5000000000000000000000** token base units.
  - Vault `Deposit` logIndex **7**, account and token matching transfer, amount **5000000000000000000000** token base units.
  - Status exactly `KNOWN_DEPOSIT_RECEIPT_MATCHED__GLOBAL_PROVENANCE_BLOCKED`, distributable surplus **0**, `independentRpcAttestationComplete=false`, `fullHistoricalInventoryComplete=false`.
- Read-only GitHub workflow https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45061453345 SUCCESS. Artifact `futures-m28-deposit-transfer-receipt` stores the logged evidence.
- This is **one** RPC receipt retrieval; independently verifying the same log/block against multiple truly independent providers remains separate work. Successful receipt retrieval cannot establish full account inventory or source-of-funds title for the protocol.

## Source matching algorithm and offline regressions

- New source `scripts/reconcile-futures-m28-source-of-funds.mjs`, tests `test/futures-m28-source-of-funds.test.mjs`.
- Focused node CI: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45061316347 — **9 PASS / 0 FAIL**.
- Verifies hard-frozen M08 chain, Vault, token, block/hash, five selected lifecycle log identities and five prior receipt confirmations, plus known-user M08 state `5000e18 available = totalAccounted = actual Vault token balance`.
- Recognizes decoded receipt-level ERC20 `Transfer` to/from Vault only when it matches the corresponding `Deposit` or `Withdrawal` accounting event by transaction, amount and account. Direct unsolicited transfers without a matching Vault event are classified as **UNATTRIBUTED**, never protocol-owned or spendable.
- Detects unmatched accounting events, duplicate log IDs, wrong chain/hash/token, malformed quantities and tampered receipt/known-account anchors.
- The additional transfer/accounting inputs in the node unit tests are **synthetic fixtures** for negative testing. They are not real historical receipts or evidence of additional historical accounts. Even if caller-supplied flags claim complete coverage and reviewed ownership, the offline reconciler never grants a payout or migration authorization.

## What is proven vs missing

**Grounded known-account fact:** Exactly one known historical deposit transfer into the historical Vault is linked to a matching Vault Deposit event in the same confirmed receipt for 5,000 mUSDT test assets. At the pinned snapshot M08 also recorded the known account's 5,000 mUSDT available right with no active position/locked margin. The matching receipt establishes the movement in that transaction, not independent evidence of legal ownership beyond the chain addresses.

**Not proven:** All ERC20 transfers into and out of the Vault from deployment through freeze, all participant wallets, all markets/tokens, full historical nonstandard cash flows, untracked economic claims, realized losses, voluntary donations, external ownership, or the right to pay any positive PnL from unexplained physical surplus. The selected HyperSync topics and one receipt are insufficient for global completeness. No new full-range Transfer log sweep or independently signed economic entitlement has been performed.

## Explicit accounting and authorization decision

- M27 `reviewBudget` evidence labels remain reviewer assertions, NOT proof of ownership.
- For this M08 known token, recorded `actualTokenBalance=totalAccounted` at the historical freeze, so physical excess = **0**. **5,000 mUSDT belongs to the known user's withdrawal-right accounting in the snapshot and must not be reclassified as protocol profit reserves.**
- No M27 spendable entitlement or approval follows from receipt matching.
- To progress: independently reconcile complete token Transfer log coverage with all Vault Deposit, Withdrawal and relevant PnL/account events across a pinned and authenticated range; prove balance movement and complete account/token inventory; then independently examine economics/title and unrecognized claims.
- Historical MVP does not expose modern Insurance/Funding reserve getters; report **UNSUPPORTED**, not zero.
- M07 cutover BLOCKED, M14 new-stack candidate NOT_RUN, PR #460 Draft/unmerged, no actual deployment, signer, `main` merge, old Vault `setEngine`, real asset migration or transfer.

**Decision: M28 known deposit receipt MATCH PASS / known-user rights PRESERVED / GLOBAL PROVENANCE and PAYOUT BLOCKED.**
