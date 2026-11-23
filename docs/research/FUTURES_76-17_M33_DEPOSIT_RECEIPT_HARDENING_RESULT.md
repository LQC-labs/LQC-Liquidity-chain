# 76-17-⑥-⑤ / M33 — Historical receipt and log identity hardening

**Result: focused CI 11 PASS / 0 FAIL. QuickNode real historical data still BLOCKED: dedicated endpoint secret absent.**

## Problem found and corrected
M32's original known-deposit receipt check verified ERC20 `Transfer` topic, indexed sender/receiver and amount, but the Vault event at `logIndex=7` was accepted based solely on the indexed account/token and amount. It did **not** validate `Deposit(address,address,uint256)` topic0 or require its original historical block hash. A substituted unrelated Vault event with a compatible payload could pass the earlier synthetic verifier.

M33 hardened the same research-only file `dex/scripts/probe-futures-m32-quicknode-archive.mjs`:
- Requires `ethers.id("Deposit(address,address,uint256)")` as exact Vault `Deposit` event topic0 in the original receipt, with precisely three topics.
- Verifies receipt's block hash `0x01b0845e57355ca1ec63f7948bf738cd91b654c0a8c7c1e179ba5e3fdc26aaf5`, known deposit block 131978250, ERC20 Transfer logIndex 6 and Vault Deposit logIndex 7, account, token and exact 5000e18 amount.
- Independently verifies `eth_getLogs` one-block Vault Deposit log's transaction, index, address, event topic0, full indexed fields, amount, block number and block hash before proceeding to historical state.
- Still requires BSC Testnet chain 97, M08 reference snapshot block/hash and actual historical token `balanceOf(Vault)` before any scope-limited capability PASS.
- Fails closed, makes no broad scan, logs no endpoint credential, and does not sign/send transactions.

## Reproducible evidence
- Updated tests: `test/futures-m32-quicknode-capability.test.mjs`; original 8 cases retained plus 3 new adversarial tests for forged Vault Deposit topic, substituted receipt block hash, and tampered one-block log.
- GitHub Actions run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45087240937 — **11 PASS / 0 FAIL**.
- The same run explicitly reported `configured=false`, `status=BLOCKED`, reason `M32_QUICKNODE_BSC_TESTNET_RPC_URL is not configured`. All mocked successful responses were synthetic. No real QuickNode paid/archive RPC calls occurred.
- Prior M29 historic evidence and M30 independent seven-identity receipt checks were retained and not reexecuted unnecessarily.

## Still unresolved
- Real QuickNode account/endpoint, Archive historical log retention, correct paid/plan entitlement and independently complete source history: **BLOCKED**.
- M08 reference known account at frozen 144115366 had 5,000 mUSDT available with no open position or locked collateral; historic physical and accounted balances matched. This remains prior evidence, not a fresh M33 on-chain balance observation.
- A single source's historical receipt matching does not certify independently complete event history or ultimate economic ownership.
- Original M31 independent archive export plan is ready for separately obtained, authenticated data but cannot be treated as evidence before actual independent acquisition.
- M07 old-user migration and any production payout, liquidity movement or protocol-owned surplus inference are BLOCKED. No `main` merge, PR #460 change, Vault `setEngine`, wallet signing, actual deployment or asset transaction.

## Next action
Do not continue creating repetitive scaffolding or retrying full-range public RPC scans. The next material unlock is an authenticated, independently controlled **BSC Testnet chainId 97 QuickNode archive endpoint** in the GitHub Actions secret `M32_QUICKNODE_BSC_TESTNET_RPC_URL`, subject to owner-approved service terms and cost. Then run one M32/M33 bounded capability gate before any large archive search; a successful small probe still does not authorize full-history, payout or migration.
