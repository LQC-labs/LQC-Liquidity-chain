# 76-17-⑥-⑤ / M08 — Indexed historical range & independent receipt reconciliation

Status: **BOUNDED INDEXED EVENT RANGE PASS; KNOWN-ACCOUNT RECONCILIATION PASS; M07 CUTOVER BLOCKED**

## Exact, independently checked deployment anchors

- BSC Testnet chainId **97**.
- Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e` creation transaction receipt: **block 131945040**.
- Engine `0xe4f1320c8709631776c7e39e0916584935882525` creation transaction receipt: **block 131945356**.
- Frozen M08 reference snapshot: **block 144115366**; hash `0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208`.

An earlier historical log query started at Engine creation block 131945356 and therefore **omitted the Vault's first 316 blocks**. The corrected HyperSync query starts at Vault creation block **131945040** and ends at **144115366 inclusive**.

## Corrected HyperSync result

- GitHub workflow https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45045069152 — SUCCESS.
- Collector commit `49fc60586724241d13d76369a14424ef03f5d14e`.
- Artifact ID `14762683164`, artifact name `futures-m08-hypersync-bounded-window`.
- Indexed page cursor covered **[131945040, 144115367)** in one successful response.
- Matching account-discovery events returned: **5** (Vault Deposit, CollateralLocked, CollateralUnlocked; Engine PositionOpened, PositionClosed).
- Distinct accounts returned: **1** — `0xde05e09db1292aff6ab62164134f1ad384bca6fb`.
- No other matching events of the selected seven account-discovery topics were returned in that historical indexed response.

## Independent RPC receipt and account-state crosscheck

- GitHub workflow https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45045010553 — SUCCESS.
- Artifact ID `14763153528` (`futures-m08-receipts-readonly`).
- **All five indexed logs** crosschecked against original transaction receipts and event names/account/log indices.
- The known account at pinned block 144115366: `positions(account,1).open=false`, position margin and size 0, Vault locked 0, available **5,000 mUSDT**.
- For token `0x7ab1b97d194730e9456c12af7905450a4f8a0c46`: `availableBalance(known account)=totalAccounted=ERC20.balanceOf(Vault)=5000000000000000000000` base units.

## Mandatory reservations

- "coverageComplete" in the indexed artifact means the **query cursor advanced through the requested block interval**; this is not a cryptographic guarantee of provider historical retention or an independently attested global inventory.
- Account extraction only covers the seven selected contract event signatures from the historical Engine/Vault ABI. Proving *all* assets, accounts, unexpected event paths, and other contracts requires explicit independent scope approval.
- Historical BSC Testnet Mock Oracle and MVP Engine are **not** the current production-ready Futures stack.
- This evidence verifies historical testnet known-account facts, not mainnet readiness or the safety of migrating open positions.
- The M07 operational/migration approval remains **BLOCKED**: independent reviewer signoff, complete account provenance, and an approved cutover/rollback mechanism are still absent.

**No main merge, PR #460 modification, Governance signature, transaction submission, production deployment or user asset transfer.**
