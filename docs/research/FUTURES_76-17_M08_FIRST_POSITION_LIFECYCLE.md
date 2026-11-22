# 76-17-⑥-⑤ / M08 — First historical testnet position lifecycle

**Status:** ONE ACCOUNT RECONCILED / COMPLETE INVENTORY BLOCKED.

Evidence is limited to historical **BSC Testnet (chainId 97)** and to the account listed below. Do not treat this as production-ready or a migration authorization.

## Verified read-only evidence

- Engine: `0xe4f1320c8709631776c7e39e0916584935882525` (historical MVP/test-only)
- Vault: `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`
- Market ID: `1`
- Account: `0xde05e09db1292aff6ab62164134f1ad384bca6fb`
- `PositionOpened` at block **131980821**, transaction `0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4`.
- `PositionClosed` at block **131984084**, transaction `0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19`.
- Snapshot block **144115366**, hash `0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208`.
- At that block: `positions(account,1).open=false`, `margin=0`, `sizeUsd=0`, `lockedBalance=0`, `availableBalance=5000000000000000000000` base units (mUSDT has 18 decimals).
- Examined Engine lifecycle log range: **131980821–132130820**, one known account only.
- GitHub read-only workflow: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/44965402673 — SUCCESS.

## Interpretation

The first documented testnet position was closed, and its account currently has no open position or locked balance. The scan does **not** cover other users, historic markets outside market ID 1, or the full lifetime from deployment to snapshot. A later opening/closing could have occurred after the event window; the final state is current to the pinned snapshot for this one account only.

**Migration gate: BLOCKED.** Account enumeration and independent historical reconciliation are not complete.

## Next safe steps

1. Obtain a comprehensive indexed Engine `PositionOpened` account set and Vault `Deposit/Withdrawal/CollateralLocked/CollateralUnlocked` account set from deployment block 131945356 through a common pinned snapshot block.
2. Cross-check every discovered account's `positions(account,marketId)`, `availableBalance` and `lockedBalance` at the same block, then reconcile totals.
3. Preserve event-range coverage proofs and gaps rather than inferring that no events means zero accounts.
4. Submit the complete snapshot to M07 offline preflight only after complete inventory independently verified. Never call `setEngine` based on the current evidence.

No signing, transactions, main merge, PR #460 edits, or operational cutover are authorized by this document.
