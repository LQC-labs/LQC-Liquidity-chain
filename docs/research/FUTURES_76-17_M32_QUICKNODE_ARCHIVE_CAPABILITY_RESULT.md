# 76-17-⑥-⑤ / M32 — QuickNode BSC Testnet archive capability gate

**Decision: MOCK CAPABILITY CHECKS 8 PASS / 0 FAIL; ACTUAL QUICKNODE ARCHIVE ACCESS BLOCKED (dedicated repository secret absent). M31 and M30 global historical completeness remain BLOCKED.**

## Context and public provider specification
- Official QuickNode BNB Smart Chain documentation lists BSC **Testnet chainId 97**, Archive **Yes**, Pruning **None**. Source: https://www.quicknode.com/docs/bnb-smart-chain
- The BNB Smart Chain `eth_getLogs` documentation states a **5-block Free Trial** query window and **10,000-block paid-plan** window. Source: https://www.quicknode.com/docs/bnb-smart-chain/eth_getLogs (updated 2026-05-06).
- Provider capability described in documentation is distinct from the actual rights, retention, price and configuration of LQC's account. Do not infer that a real endpoint is usable simply because a provider advertises archive support.

## M32 source and actual CI
- Script: `dex/scripts/probe-futures-m32-quicknode-archive.mjs`
- Tests: `test/futures-m32-quicknode-capability.test.mjs`
- Scoped workflow: `.github/workflows/futures-m32-quicknode-gate.yml`
- Final GitHub Actions run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45086826666 — **8 PASS / 0 FAIL**; the independent-provider capability result in the same job is `status=BLOCKED`, `configured=false`, reason `M32_QUICKNODE_BSC_TESTNET_RPC_URL is not configured`.
- An earlier test run failed because of an overescaped QuickNode hostname expression; the research script was corrected, tests rerun, and **final scoped CI passed**. The earlier failure is not reported as completed test evidence.
- Artifact `futures-m32-quicknode-capability` preserves the correctly blocked result without a provider credential.

## Guarded read-only probe behavior
The probe is intentionally bounded to five remote JSON-RPC reads, and issues **zero** external calls if a dedicated QuickNode endpoint is absent or fails a narrow HTTPS/hostname validation. The endpoint is read from a GitHub Actions secret, not a repository source file or command-line parameter. Output omits endpoint paths and all upstream error messages.

When configured, it checks in order and stops at the first failure:
1. `eth_chainId` equals 97.
2. `eth_getBlockByNumber` at M08 block 144115366 matches `0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208`.
3. `eth_getTransactionReceipt` for the known deposit transaction identifies its ERC20 Transfer and Vault Deposit logs and 5,000 mUSDT amounts.
4. One-block `eth_getLogs` at block 131978250 confirms the matching Vault Deposit log identity.
5. `eth_call` on the historical token `balanceOf(Vault)` at the M08 pinned block returns `5000000000000000000000` base units.

A pass on these five reads yields `SMALL_READ_ONLY_ARCHIVE_PROBE_PASS__FULL_HISTORY_BLOCKED`, **never** global completeness or operational entitlement. Actual BSC archive log pagination would be a separate, explicitly scoped and budgeted stage after these prerequisites pass.

## Test results
- Eight Node tests validated: missing endpoint makes zero calls; untrusted/malformed endpoints are rejected before network access; a synthetic full five-read success still leaves complete historical inventory blocked; wrong chain/hash/receipt/value, missing one-block logs, absent historical state and error redaction fail closed.
- Synthetic mocked provider responses are **not evidence** of working archive access.
- The final workflow called the script with an empty secret and reported **BLOCKED without network requests**.
- No QuickNode account, paid subscription, wallet signature, main branch update, PR #460 modification, deployment or asset transaction occurred.

## Remaining requirements and efficiency recommendation
- Provision a dedicated **QuickNode BSC Testnet chainId 97 HTTPS endpoint** from an authorized account with suitable historical state and log access. Do not paste the private endpoint into public code, PR comments or general chat; store it in the repository's `M32_QUICKNODE_BSC_TESTNET_RPC_URL` Actions secret.
- First run only M32's five-read capability test. If a historical balance or one-block event query fails, record BLOCKED rather than retrying thousands of full-range requests.
- If the small capability check passes, independently compare a limited archival window and determine approved limits/rates/costs before attempting the full [131945040,144115366] history. Under the documented 10,000-block limit a simple three-filter sweep would require at least 3,654 calls; on 5-block trial it would be far more expensive.
- Prior M08–M29 known user's 5,000 mUSDT collateral right remains protected. Economic protocol-owned surplus **0 proven**. M07 cutover and all payouts remain BLOCKED, M14 on-chain integration NOT_RUN, PR #460 Draft/unmerged.

**M32 executable scope: read-only research on isolated branch; no signer, asset movement, governance activation, main merge or production release.**
