# LQC Flow DEX Security Test Matrix

Status: **repository test evidence for an unaudited testnet MVP**

Run the current baseline with:

```bash
cd dex
npm ci
npm test
```

The current suite compiles **41 Solidity sources** and reports **118 passing tests**. Future commits may change that count; the CI result for the exact reviewed commit is authoritative.

| Security property | Automated evidence | Status / boundary |
|---|---|---|
| AMM reserve accounting and non-decreasing constant product | `test/amm.test.mjs` | Covered by integration and deterministic stateful invariant tests; not a formal proof. |
| Permanently locked minimum LP liquidity | `test/amm.test.mjs` | Covered. |
| Exact-input, exact-output, multi-hop, and native BNB flows | `test/amm.test.mjs`, `test/native-router.test.mjs` | Covered for supported standard ERC-20 behavior. |
| Deadline, minimum-output, slippage, and invalid-path rejection | `test/amm.test.mjs`, `test/router-v2.test.mjs`, `test/native-router.test.mjs` | Covered. |
| Pair/router reentrancy resistance | `test/amm.test.mjs`, `test/router-v2.test.mjs` | Lock and adversarial callback behavior covered; independent review pending. |
| Exact temporary approvals and zero router/adapter custody | `test/router-v2.test.mjs`, `test/native-router.test.mjs` | Success, revert residue, and adversarial partial-spend rollback checks covered across Router and Adapter boundaries. |
| Registry adapter bytecode and interface validation | `test/router-v2.test.mjs` | EOA and incompatible-contract registration or replacement is rejected without mutating an approved DEX entry. |
| Disable-before-change DEX lifecycle | `test/router-v2.test.mjs` | Adapter replacement and DEX removal revert while enabled; changes succeed only after governance-visible disablement. |
| Staged DEX activation after risk configuration | `test/router-v2.test.mjs`, `test/testnet-bootstrap.test.mjs`, `test/vault-router-risk-integration.test.mjs` | New DEX entries default to disabled and require an explicit governance activation after route and limit setup. |
| Adapter downstream endpoint bytecode validation | `test/router-v2.test.mjs` | LQC Flow and Pancake V2/V3 adapters reject undeployed Router or Quoter endpoints at construction. |
| Atomic split rollback | `test/router-v2.test.mjs` | A failed later leg must revert balances, pool reserves, custody, and usage accounting. |
| Duplicate DEX leg rejection | `test/router-v2.test.mjs`, `test/risk-registry.test.mjs` | Covered to prevent per-DEX cap bypass. |
| Token allowlist and per-transaction, daily, and per-DEX caps | `test/risk-registry.test.mjs` | Covered, including stateful model comparison and rejected-transaction accounting. |
| Risk administrator is reduce-only | `test/risk-registry.test.mjs` | Cannot add permissions or expand limits. |
| Guardian pause-only authority and timelocked recovery | `test/governance.test.mjs` | Covered, including two-step emergency-controller ownership transfer. Final production signers are pending. |
| Dual-feed oracle positivity, freshness, and deviation | `test/gas-oracle.test.mjs` | Covered with mocks; production feeds and parameters pending. |
| V3 endpoint, path, fee-tier, pool, and hop validation | `test/router-v2.test.mjs`, `test/router-sdk.test.mjs` | Covered for configured reviewed pools. Production integration review pending. |
| Fee-on-transfer input rejection | `test/router-v2.test.mjs` | Explicit rejection and rollback covered; these tokens remain unsupported. |
| BSC testnet chain ID 97, bytecode, and module/link ownership checks | `test/testnet-validation.test.mjs`, `test/testnet-bootstrap.test.mjs` | Validator behavior covered; each real deployment must still be validated. |
| Test token ownership and supply behavior | `test/testnet-token.test.mjs` | Test infrastructure only; not evidence for a final production LQC token. |
| Browser route encoding and execution-plan SDK | `test/router-sdk.test.mjs` | Covered for supported routing formats. |
| Reproducible BscScan verification bundle generation | `test/verification-bundle.test.mjs` | Bundle structure and source revision covered; explorer publication is deployment-specific. |
| Vault donation-resistant share and idle-asset accounting | `test/liquidity-vault.test.mjs` | Covered for direct donations before deposits and strategy allocation. |
| Vault strategy approval, role separation, and exposure cap | `test/liquidity-vault.test.mjs` | Covered with a vault-specific reference adapter; production strategies remain pending. |
| Strategy recall loss bound and shutdown-only emergency override | `test/liquidity-vault.test.mjs` | Covered with a deterministic lossy mock; economic safety and live protocol behavior remain unaudited. |
| Vault isolation from Router, Risk, and DEX adapters | `test/vault-router-risk-integration.test.mjs` | Successful swaps and rejected cap/disabled-route paths must leave Vault principal, shares, accounting, and approvals unchanged. |
| Vault total-loss insolvency fail-closed behavior | `test/liquidity-vault.test.mjs` | A zero-asset vault with outstanding shares rejects share quotes and deposit reopening; recapitalization requires a separately reviewed recovery mechanism. |
| Testnet Vault deployment record and on-chain linkage | `test/testnet-validation.test.mjs`, `test/testnet-bootstrap.test.mjs` | Vault/adapter bytecode, asset binding, roles, caps, empty initial accounting, and insolvency state are validated before smoke tests; operational pauses remain valid warning states. |
| Testnet Vault solvency and backing monitoring | `test/monitoring.test.mjs` | Strategy debt/cap, idle backing, adapter backing, insolvency, and pause states produce fail-closed monitoring results. |
| Reproducible deployment evidence completeness | `test/testnet-validation.test.mjs`, `test/verification-bundle.test.mjs` | Full source SHA, exact compiler settings, separated governance/risk roles, and every required deployment transaction hash are mandatory. |
| Reviewed-source deployment binding | `test/testnet-preflight.test.mjs` | Preflight and deployment reject missing/mismatched source SHAs and any dirty worktree before a transaction can be sent. |
| Canonical checkpoint receipt recovery | `test/deployment-checkpoint.test.mjs` | Every reused confirmed operation must retain a successful receipt at its recorded block; missing, mismatched, reverted, or reorganized evidence fails closed. |

## Evidence limits

Passing tests show that specified cases behaved as expected in the repository environment. They do not establish the absence of vulnerabilities, validate production governance, certify economic safety, or constitute an audit. Coverage measurement, broader property fuzzing, static analysis, external review, production-fork testing, and capped public testnet evidence should be added before mainnet consideration.
