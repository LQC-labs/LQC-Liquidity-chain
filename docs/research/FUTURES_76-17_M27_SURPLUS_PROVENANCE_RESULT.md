# 76-17-⑥-⑤ / M27 — Surplus provenance and nonpayable claim budgeting

**Status: ISOLATED FOUNDRY 21 PASS / 0 FAIL; actual provenance ownership NOT VERIFIED; payout NOT AUTHORIZED.**

## Evidence
- New positive-review ledger: `dex/contracts/futures/LQCFuturesM27SurplusProvenanceReview.sol`.
- Focused Foundry tests: `test/LQCFuturesMigrationM27SurplusProvenance.t.sol`.
- GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45060997533 — 21 PASS / 0 FAIL; 11 inherited M26 and 10 M27 tests, one M27 fuzz test with 256 generated runs.
- Scoped Foundry config: Solidity 0.8.30 viaIR optimizer 200, Shanghai.
- Canonical Engine and Vault unchanged; read-only M26 two-sided FX and underlying Vault remain separate.

## Actual repository-grounded issue
- M26 can compute physical `unreservedVaultSurplus(token) = ERC20 balance - (totalAccounted + fundingPoolBalance + insuranceFeeReserve + treasuryFeeReserve)`.
- M26 separately rejects any actual `residualBadDebt`. These physical accounting conditions **do not establish ownership or legal/economic distribution authority** for the remaining token units.
- Direct token donations, realized liquidation losses, pending or unidentified claims and historical migration obligations can all create surplus-looking assets that are not a permitted profit-payout pool.
- Independently repeated M26 previews against the same static physical excess could each report a positive payout, even though they would collectively exceed the same available excess if executed. M27 demonstrates a reviewer-controlled reservation counter for that risk without providing executable payouts.

## M27 research prototype
- Owner-like `reviewer` role only (immutable, constructor provided), **not independent proof of signers, Safe execution, external auditor or economic ownership**.
- `reviewBudget(token,evidenceHash,reviewedAmount,encumberedClaims)` requires nonzero evidence hash, cannot exceed current physically measured unreserved surplus, cannot coexist with open quote reservations and rejects nonzero residual bad debt. `evidenceHash` is only a review reference or assertion; no attestation authenticity, signature, provenance receipt or historical transfer trace is verified in code.
- Explicit holdback `encumberedClaims` reduces `remainingReviewedBudget`; the number is supplied by the reviewer, not automatically inferred from untracked claims.
- `reserveQuote(claimId, token, claimant, usd18, decimals, evidenceHash)` verifies same review hash, no replayed claim ID, no residual debt, live collateral quotes, ERC20 decimal identity, M26 bounded FX payout, and aggregate `reservedQuotes` against both reviewer budget and actual physical surplus.
- Reservation is a **review queue / bookkeeping observation, not a payable right**. The contract cannot transfer assets, call Vault settlement, commit a distribution or create user receivables.
- `cancelQuote` restores quota but never clears the used claim ID, preventing replay under the same ID. There is no executable claim withdrawal or payout route.
- Reviewer can review a new budget only after all reservations are cancelled; changing `evidenceHash` while reservations exist is blocked.

## Tests
1. Unattributed 200-token direct donation yields positive physical surplus, but no M27 review budget and quote reservation is rejected.
2. Explicit research-only reviewed 200-token budget and $100 USD18 payout quote at upper oracle price $0.82 reserves 121.951219 six-decimal tokens, leaving 78.048781 capacity **without moving tokens or altering user rights**.
3. Another $100 USD18 quote is rejected: it would overbook the same 200 token budget.
4. 100-token encumbered third-party claim holds capacity back and prevents the same $100 reservation.
5. Oversized review budget and empty evidence are rejected.
6. Budget evidence cannot change with an existing open quote.
7. Cancellation restores quota but preserves a spent claim ID.
8. Outstanding residual bad debt prevents new reviewed budgets and quote reservations.
9. Nonreviewer cannot supply attestations or reserve claims.
10. One 256-run bounded fuzz test shows successful reservations never exceed the supplied reviewed budget and insufficient physical liquidity is rejected.
11. Eleven inherited M26 quote, payout-cap, protected-reserve and negative tests remain PASS.

## Security limitations and next substantive blocker
- An arbitrary reviewer's hash and allowance **cannot prove** real ownership. Production release needs independently sourced transfer/receipt evidence, economic claim reconciliation, risk allocation policy, governance authorization and signed attestations binding token, chain, Vault, amount, evidence version and expiry.
- M27 measures current physical excess at reservation time, but Vault assets, reserves, Oracle quotes and untracked economic claims can change after a reservation. There is no atomic payout and no guarantee the reserved token amount will remain affordable or economically valid; quote age / expiration and reconciliation must be specified.
- Existing `LQCFuturesVault` has no source-tagging for voluntary donations or realized-loss proceeds; the research budget cannot identify them independently from chain receipts. Do not infer spendability from a reviewer-entered category.
- Model budget and reservation fields are not authenticated to a specific chain/block snapshot or source evidence beyond the supplied bytes32 label. No real signer, external audit, multisig or production risk policy is proved.
- M07 historical migration and M14 new-stack on-chain provenance remain BLOCKED. PR #460 remains separate Draft, not reviewed/merged. No main merge, historical Vault `setEngine`, production deployment, approval signature or token movement.

## Recommendation
M28 should target **verifiable source-of-funds evidence and claim completeness** for the existing historical and future Vault, using a read-only receipt / log reconciliation against frozen block hashes and independently checked RPC/indexer observations. Separate identified realized loss, unowned donation, fees, settlement liabilities and user funds, without changing any actual Wallet or signing state. Do not add an executable payout route until these proofs and governance rules exist.
