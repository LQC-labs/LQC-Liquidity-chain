# LQC Flow DEX Security Test Matrix

Status: **repository test evidence for an unaudited testnet MVP**

Run the current baseline with:

```bash
cd dex
npm ci
npm test
```

The current suite compiles **48 Solidity sources** and reports **175 passing tests**. Future commits may change that count; the CI result for the exact reviewed commit is authoritative.

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
| Proof of Best Execution | `test/router-sdk.test.mjs` | Produces tamper-evident single/split decision receipts, proves gas-adjusted route selection, rejects non-improving splits and inconsistent allocations, and excludes raw route data. |
| Proof-to-Settlement binding | `test/router-sdk.test.mjs` | Binds a valid route proof to successful BSC testnet transaction and block evidence, enforces expiry and minimum output, records execution variance, and detects receipt tampering or proof substitution. RPC finality and event decoding remain external prerequisites. |
| Canonical ERC-20 settlement verification | `test/router-sdk.test.mjs` | Re-fetches the transaction and canonical block, enforces confirmation depth, and exactly reconciles output-token transfers to the committed recipient. Reorgs, insufficient finality, and log mismatches fail closed; native BNB is excluded. |
| Canonical native BNB settlement verification | `test/router-sdk.test.mjs` | Requires one event from the reviewed Native Router and reconciles recipient, input token, direction, input amount, and actual BNB output after canonical block and finality checks. Spoofed, duplicate, or inconsistent events fail closed. |
| Execution-proof deterministic fuzz invariants | `test/settlement-proof-invariants.test.mjs` | Exercises 250 varied best-route settlements plus 250 proof-bound receipt mutations. Valid outputs remain above the committed minimum and every mutated settlement field fails verification. Deterministic fuzzing is reproducible but does not replace formal verification. |
| Router SDK coverage gate | `scripts/check-router-sdk-coverage.mjs` | Uses dependency-free V8 precise coverage and fails below 100% function or 90% executed-range coverage. The reviewed baseline is 35/35 functions and 217/241 ranges; neither metric is mislabeled as branch or Solidity coverage. |
| Critical Solidity audit-surface drift | `test/critical-audit-surface.test.mjs`, `audit/critical-surface.json` | Maps all 36 state-changing ABI entry points across Execution Router, Risk Registry, and Liquidity Vault to explicit authority, critical/high risk, and existing automated evidence. Any unclassified ABI change fails the suite. |
| Critical cross-module attack paths | `test/critical-attack-paths.test.mjs` | A malicious DEX adapter cannot reenter the Execution Router or retain funds/approval; an attacker cannot steal Risk/Vault authority, bypass pauses, consume limits, reopen deposits, or change caps/strategy. Rejected attacks preserve balances and configuration. |
| Malicious Strategy callback isolation | `test/critical-attack-paths.test.mjs` | Strategy callbacks cannot reenter Vault allocation or recall. Both attacks revert atomically and preserve idle assets, strategy token backing, managed-asset accounting, and strategy debt. |
| Dishonest Strategy accounting isolation | `test/critical-attack-paths.test.mjs` | False deployment returns, false managed-asset deltas, short token returns, false withdrawal returns, and false debt reductions all revert atomically while preserving Vault and Strategy accounting. |
| Rebasing-token Vault isolation | `test/critical-attack-paths.test.mjs` | Positive rebases remain outside share pricing; a negative idle-balance rebase makes backing deficient and fails new deposits, strategy allocations, and all withdrawals closed without changing debt or Strategy balances, preventing first-mover extraction and deficit migration. Rebasing tokens remain unsupported. |
| Non-standard ERC-20 return isolation | `test/critical-attack-paths.test.mjs` | Empty legacy returns are accepted, strict 32-byte true returns are required otherwise, and false, short, or oversized transfer/transferFrom/approve returns revert atomically. Zero-first approvals remain supported. |
| Hostile ERC-20 balance/callback isolation | `test/critical-attack-paths.test.mjs` | Reverting or short `balanceOf` responses fail deposits closed, and transfer callbacks cannot reenter Vault deposit or withdrawal; rejected calls preserve assets, shares, supply, and backing. Arbitrarily lying token balances remain outside the supported-token trust boundary. |
| Reproducible BscScan verification bundle generation | `test/verification-bundle.test.mjs` | Bundle structure and source revision covered; explorer publication is deployment-specific. |
| Vault donation-resistant share and idle-asset accounting | `test/liquidity-vault.test.mjs` | Covered for direct donations before deposits and strategy allocation. |
| Vault strategy approval, role separation, and exposure cap | `test/liquidity-vault.test.mjs` | Covered with a vault-specific reference adapter; production strategies remain pending. |
| Paused-by-default Strategy staging | `test/liquidity-vault.test.mjs`, `test/testnet-bootstrap.test.mjs` | New Vaults and the BSC testnet bootstrap remain allocation-paused after Strategy configuration and ownership staging. Activation requires a separately reviewed Timelock operation; Strategy replacement is rejected unless allocations are paused and debt is zero. |
| Vault ownership and administrator continuity | `test/liquidity-vault.test.mjs` | Two-step ownership acceptance automatically transfers only default owner-held pause and strategy roles; explicitly separated administrators remain unchanged and the former owner retains no implicit authority. |
| Strategy recall loss bound and shutdown-only emergency override | `test/liquidity-vault.test.mjs` | Covered with a deterministic lossy mock; economic safety and live protocol behavior remain unaudited. |
| Reported Strategy loss isolation and reconciliation | `test/liquidity-vault.test.mjs` | A managed-asset report below Strategy debt blocks deposits, withdrawals, further allocations, and operational reopening. Only governance under full shutdown can recognize a bounded loss before recalling the remaining assets. Strategy valuation integrity remains adapter-dependent and unaudited. |
| Vault isolation from Router, Risk, and DEX adapters | `test/vault-router-risk-integration.test.mjs` | Successful swaps and rejected cap/disabled-route paths must leave Vault principal, shares, accounting, approvals, active strategy debt, and deployed strategy assets unchanged. A reported Strategy loss fails Vault entry points closed; shutdown-only reconciliation, full recall, and withdrawal recovery complete without contaminating reviewed Router settlement, Risk usage, or Router/adapter custody. |
| Vault total-loss insolvency fail-closed behavior | `test/liquidity-vault.test.mjs` | A zero-asset vault with outstanding shares rejects share quotes and deposit reopening; recapitalization requires a separately reviewed recovery mechanism. |
| Testnet Vault deployment record and on-chain linkage | `test/testnet-validation.test.mjs`, `test/testnet-bootstrap.test.mjs` | Vault/adapter bytecode, asset binding, roles, caps, empty initial accounting, insolvency state, and the mandatory allocation pause are validated before smoke tests. A missing, false, or mismatched initial allocation-pause record fails closed. |
| Testnet Vault solvency and backing monitoring | `test/monitoring.test.mjs` | Strategy debt/cap, idle backing, adapter backing, insolvency, and pause states produce fail-closed monitoring results. The expected initial allocation pause is healthy only while it matches the deployment record; any drift is critical. |
| Reproducible deployment evidence completeness | `test/testnet-validation.test.mjs`, `test/verification-bundle.test.mjs` | Full source SHA, exact compiler settings, separated governance/risk roles, and every required deployment transaction hash are mandatory. |
| Reviewed-source deployment binding | `test/testnet-preflight.test.mjs` | Preflight and deployment reject missing/mismatched source SHAs and any dirty worktree before a transaction can be sent. |
| Safe signer and threshold validation | `test/testnet-preflight.test.mjs` | Preflight reads on-chain Safe owners and thresholds, rejects malformed signer sets, and enforces the reviewed governance 4-of-7 and risk 3-of-5 minimum policies. |
| Safe configuration drift and incident workflow | `test/monitoring.test.mjs` | Monitoring fails closed when signer count or threshold falls below policy, warns on other signer/threshold changes, and emits a deterministic multisig-pause, evidence, remediation, timelock, and post-check workflow without sending transactions automatically. |
| Emergency pause and timelocked recovery drill | `test/emergency-drill.test.mjs` | Reproduces a healthy swap, guardian DEX/all-swap pause, blocked execution, failed early recovery, delayed governance recovery, route re-enable, and successful post-recovery swap. Safe signature collection remains an external operational prerequisite. |
| Emergency drill audit report | `test/emergency-drill-report.test.mjs` | Requires eight ordered PASS steps, BSC testnet chain 97, a pinned source revision, transaction/read-only evidence, chronological timestamps, the full timelock delay, and a deterministic SHA-256 evidence digest. |
| Exchange/security review evidence package | `test/review-evidence-package.test.mjs` | Binds deployment, healthy monitoring, and passing drill artifacts to chain 97, one source revision, one deployment fingerprint, per-artifact digests, and a package digest; external audit, explorer, and legal evidence remain explicit gates. |
| Human-readable review summary | `test/review-evidence-markdown.test.mjs` | Verifies the package digest before rendering a Markdown baseline, evidence table, drill reference, and explicit outstanding gates; escapes untrusted table content. |
| Atomic review bundle generation | `test/review-bundle.test.mjs` | One command validates the source artifacts and emits JSON evidence, Markdown summary, and a digest manifest; existing evidence files are never overwritten. |
| Canonical checkpoint receipt recovery | `test/deployment-checkpoint.test.mjs` | Every reused confirmed operation must retain a successful receipt at its recorded block; missing, mismatched, reverted, or reorganized evidence fails closed. |

## Evidence limits

Passing tests show that specified cases behaved as expected in the repository environment. They do not establish the absence of vulnerabilities, validate production governance, certify economic safety, or constitute an audit. Coverage measurement, broader property fuzzing, static analysis, external review, production-fork testing, and capped public testnet evidence should be added before mainnet consideration.
