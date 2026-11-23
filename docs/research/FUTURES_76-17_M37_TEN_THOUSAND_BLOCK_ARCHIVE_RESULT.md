# 76-17-⑥-⑤ / M37 — One bounded 10,000-block archive comparison

**Decision: TEN_THOUSAND_BLOCK_LOGS_MATCH__FULL_HISTORY_BLOCKED.** Independently queried QuickNode archival `eth_getLogs` and HyperSync indexer agree for one selected window. No operational payout/migration acceptance.

## Evidence and precise window
- New script: `dex/scripts/verify-futures-m37-10k-window.mjs`.
- New test: `dex/test/futures-m37-10k-window.test.mjs` — **9 PASS / 0 FAIL** (synthetic fixture and fail-closed regression tests).
- Focused workflow: `.github/workflows/futures-m37-10k-pilot.yml`.
- GitHub Actions final success: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45114130544 .
- Artifact `futures-m37-bounded-10k-window`, ID **14790807073**.
- Fixed historical scope BSC Testnet chainId 97, **[131975000,131985000)**, i.e., exactly 10,000 blocks. Historical Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`, mock mUSDT token `0x7ab1b97d194730e9456c12af7905450a4f8a0c46`.
- Returned relevant events: **4 HyperSync / 4 QuickNode / 4 matched** (all Vault logs plus token Transfer events into/out of Vault for selected collateral). Missing 0, extra 0; anchored known historical 5,000 mUSDT Transfer and Deposit match.
- Normalized log SHA256, both providers: `03c374595c92560d29a00f1c08cac269939f736a87f475f528e9bdc819c59835`.
- **4 actual external HTTP requests:** one HyperSync selected-window indexer query and three QuickNode `eth_getLogs` filters (Vault, token inbound, token outbound). Hard cap four. No broad history or asset transaction.
- Secrets `ENVIO_API_TOKEN` and `M32_QUICKNODE_BSC_TESTNET_RPC_URL` only read inside Actions; output has no private endpoint, API token or upstream error text.

## Cost and scaling gates
- Inclusive M08 historic range [131945040,144115366] contains **12,170,327 blocks**. At 10,000 blocks/window it requires **1,218 windows** to cover exactly that full interval.
- At M37's three QuickNode filters per window that means **3,654 QuickNode `eth_getLogs` calls** and a further **1,218 HyperSync indexer calls**, if each one returns a complete bounded range response (actual pagination, quotas, failures, retries and volume could increase calls).
- **Actual QuickNode credit charges and USD costs were NOT measured** in this script, so do not equate number of requests with fixed charge. Before full sweep, obtain dashboard credit-cost observation and approve a bounded spend and call budget.
- The preexisting source range cap and budgeted pilot have been met. Bulk scanning was **not** requested, authorized or executed.

## Interpretation and limitations
- Real isolated source agreement for 10,000 blocks is stronger than M35/M36 three-block pilots, but not evidence of absence of events in unqueried regions or across other tokens/contracts.
- The M29 HyperSync indexed full-range query and prior PublicNode receipts demonstrate a previous bounded source record but not independently complete global history. M37 verifies only this 10k subset.
- Prior M08 frozen known account 5,000 mUSDT available, 0 locked, no open position; Vault physical balance equals accounted in the historical snapshot. This previously recorded right is not a source of protocol-owned distributable liquidity.
- Economic title, independent provider retention, hidden assets, additional token inventory, unrecorded liabilities and full account completeness remain BLOCKED.
- No main merge, PR #460 change, onchain deployment, historical Vault `setEngine`, wallet signature, user asset movement or new operating entitlement.

## Recommended next work
M38: use QuickNode dashboard's **actual billed API credit/usage metrics** to quantify the cost of a 10,000-block three-filter window (observe an interval and avoid estimating from number of calls alone). Approve a total fixed monetary/credit budget and fail-closed resume/checkpoint rules before any significant multi-window scan. Preserve all existing M37 evidence; do not repeat the completed pilot unless source evidence is compromised.
