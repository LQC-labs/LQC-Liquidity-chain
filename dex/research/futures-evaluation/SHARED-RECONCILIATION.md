# Shared obligation reconciliation diagnosis

## Scope

Base: PR #408 merge 63b20731dbfd2d9f3d32c059c991dcee04b7c5ab. Pure offchain diagnostics for one Domain, Series, token and fixed Q. No contracts, Registry, anchors, original evidence, services or money paths change. No RPC or chain execution. Local implementation stages 2/76 and 2/78 stopped before commit/push/PR; the separate 2/79 integration is described below.

The module does not calculate a new Funding, price or rounding rule. It reuses existing V1 source/history validation, segment and lot outputs, exact rational arithmetic, converted diagnostic output and the cumulative V1 ledger. The PR408 entriesState function is exported without changing its body for multi-account consumption groups. Existing-Series keys and recorded evidence use the unchanged PR408 loader/diagnosis.

## Source boundaries

loadSharedReconciliationCase returns a privately branded context and a separate mutable submission. A reviewed test-only reference JSON is hash-pinned independently of submitted lists. The loader independently obtains existing pinned V1 source/calculator outputs. Inventory sets are compared by every identity and full original record, not totals. Normal submitters cannot supply a reference or verified/approved flag.

Cases partial, open-gap and rounding reuse original V1 research cases. sequential and sequential-debt explicitly relabel accounts in the existing synthetic flip50 quantities/times/calculation outputs. The immutable reference definition binds that projection. These are NEW SYNTHETIC accounting examples, not original history/account/Receipt authentication, not approved new Series, and not real close/reopen transactions. Amount formulas are not rerun with invented rates/prices; exact existing position results are regrouped. Source original commitment identifies the original synthetic calculation basis; it does not authenticate the projected identities.

The one-active-position-per-account envelope is enforced in original transition order, including close then reopen at one timestamp. The pure helper may be tested with modified synthetic activity; only branded contexts enter the full diagnosis.

recorded-legacy uses the real archived local candidate and never converts its existing Series to V1. It lacks a full multi-position inventory/obligation/consumer/cash reference, so completeness and money data remain UNVERIFIED/null. Missing data is not replaced by empty complete sets or zero.

Evidence levels remain separate: SYNTHETIC_REFERENCE, LOCAL_RECORDED, and UNVERIFIED independent chain/finality/persistent-ledger/price-policy/shared-cash authentication. No authenticated-chain input verifier is implemented or implied. Local reference completeness is not chain completeness.

## Joins and units

Accounts, positions, transitions and closed/open-remainder lots are exact set comparisons. Transitions also preserve original ordinal, transaction/log/time order, old/new quantities and per-position Sequence. The activity check rejects concurrent same-account positions and PID reuse.

USD18 exact debt and claim are separately reconciled lot -> segment/position -> position/Epoch -> account/Epoch -> Domain/segment, with both gross side totals preserved. Domain gross equality is additionally checked against original existing computed amounts. Raw cash never substitutes for USD18 postings. No netting hides opposite obligations. Open positions and policy tails remain explicit blockers.

Original legacy aggregate obligation keys are reused. V1 synthetic scope lacks authenticated Runtime pins, so economicKeys remains null with a blocker rather than fabricated hashes. Local posting/lot IDs are diagnostic row IDs, not claim/consumption identifiers.

## Consumption

Position collection/payment rows group by account, official/Gap, Epoch/period and operation; reused entriesState checks Sequence, unique Receipt and cumulative amounts, then compares account/Epoch terminals and independent synthetic source rows. A normal prefix or missing terminal stays PARTIAL; no submission and an empty declared subtotal are different. Model targets, USD obligations, submitted subtotals and locally observed synthetic receipts are separate. Full local terminal matching never authenticates a durable ledger.

Synthetic cash routing supports one official Epoch and either one position per account/side or exact-integer multi-position partitions. Existing ledger collection/payout targets are reused. Fractional multi-position routing is explicitly unsupported; no rounding allocation policy is invented. The same-account sequential-debt case validates two position collections against one cumulative terminal.

## Cash and reservations

Within the pinned FUNDING_ONLY_ZERO_INITIAL synthetic book, initial cash zero and absence of other obligations are explicit reference assumptions. Initial cash + collections - payments - refunds must equal ending cash. Existing create/advancePolicyV1Ledger supplies principal, unpaid debt, remaining claims, overpayment refund rights and fractional reservation equations; they are not reimplemented as a new economic formula.

GENERAL_POOL_OBSERVED, unknown initial cash, unknown other obligations or missing source ledger cannot use the Funding-only rights equation. General-Pool initial capital can be checked as declared cash-flow arithmetic but remains unverified. External capital/insurance/other transaction kinds are unsupported and rejected, never silently treated as zero or Funding proceeds. No actual Pool isolation proof is produced.

Buckets sum to cash and reportedAccounted equals the bucket sum only. Reservations are subsets of that same cash, never additional buckets. Exact rational reservation intervals must be nonoverlapping, bounded by cash, and assigned separately to funded claims/refund rights. Their total and right-level amounts are checked against the reused ledger. Fractional rights are not individually rounded to promise extra transfers.

## Results and limitations

Every full result has evaluationStatus NOT_EVALUATED; confirmedAmount, payableAmount, returnAmount and lpRecoveryAmount null; every authority flag false. Matching helpers or synthetic books do not authorize payment, return, Held use, LP recovery or claims. Exceptions return no approval. Difference stages and precise blocker codes separate invalid data, partial history and unavailable evidence. Results do not mutate or freeze caller submissions.

No live-state, independent completeness, price, cash, reservation ownership or shared-fund independence proof is available for the archived real candidate. No collateral or LP eligibility is changed. Future source integrations must establish an independent reference through a verifier; a caller-provided flag or jointly supplied list cannot do so.

## Tests

run-shared-reconciliation-tests.cjs validates a separate fixed required list, its embedded SHA-256 and test-source hashes before Mocha. It reuses PR408 plan structure/file and JSON report validators. Expected names are manually enumerated, never extracted from test source. Zero/missing/duplicate/unexpected execution and source deletion are rejected. The local protection does not withstand jointly replacing checker and plan. Offline guard is auxiliary JavaScript defense, not an OS sandbox.

One recorded integration execution: 208 PASS, 0 FAIL/PENDING, process exit 0. New shared diagnosis 58 plus new plan 4; necessary regression 146 = existing V1 configuration/history 34 + V1 prices/ledger 42 + recorded V1 evidence 9 + PR408 diagnosis 48 + fixed runner 13. The unchanged broader 234-input suite, contract suites and chain scenarios were not repeated. New actual-candidate diagnosis exercises the existing pinned loader; required existing behavior is covered by the 146 selected tests. Logs, source snapshots, exact list/counts/exit, hashes and actual candidate output remain local under .results. Separate future runs must stay separate.

Tests distinguish pure helper activity rejection from full branded diagnostic paths. Negative checks assert the exact target stage/error; inventory reference failures do not count as downstream finance validation. General-Pool and evidence-absent cases expect UNVERIFIED, not a false financial PASS.

QuickNode #24088 remains awaiting reply/payment on hold at last confirmation.

## Task 2/78 identity hardening

New isolated branch based on PR408 plus preserved task2/76 changes. No contracts, anchors, original evidence or economic formulas change.

Reservations bind account, position, local detailed obligation key, token and right category. Each exact fractional allocation is checked against that owner's pinned synthetic right; intervals still cannot overlap. These local keys lack authenticated Runtime provenance and do not establish cross-version multi-position consumption identity.

A consumption unit is scoped by the fixed source scope commitment and transaction hash/logIndex/itemIndex, independent of claimant group. Business Receipt and group Sequence are bound payload. A transaction hash alone is NOT unique consumption: distinct logs/items may be normal. Reuse of the physical unit in another group is rejected even with a new row ID. Cash and consumption rows must have identical consumptionIdentity payload. These fields are SYNTHETIC_RECEIPT_MODEL_NOT_VERIFIED_CASH, not authenticated chain events. Editing event coordinates cannot manufacture authenticated evidence; existing pinned source row comparison remains required.

Cash/consumption link diagnostics run independently of each side's original-row mismatch (after inventory passes), so the direct link mismatch is recorded as well. A match never overrides any mismatch, blocker or disabled authority. The V1 ledger receives only its unchanged original event schema; diagnostic identity fields are checked outside that financial model.

Direct full-diagnosis tests cover owner/obligation replacement, cross-group physical-unit reuse with distinct row IDs, cash identity mismatch and legitimate multiple logs in one transaction. Helper-only tests are labeled: same-owner known obligations, per-owner balance, same-log distinct items and explicit unsupported multi-Epoch/fractional multi-position routes. No helper result authenticates a ledger.

COMMON_CALCULATION_REFERENCE_NOT_INDEPENDENT_PROOF and MULTI_POSITION_CROSS_VERSION_CONSUMPTION_UNVERIFIED remain explicit blockers. No new price/Funding/rounding policy, chain verifier or execution authority is implemented. QuickNode #24088 remains awaiting reply/payment on hold at last confirmation.

Task2/78 recorded one integration execution: 225 PASS / 0 FAIL / 0 PENDING, exit 0. This is 17 new identity tests plus 208 changed-impact regression tests (task2/76 shared58 + runner4 + prior selected146). No tests were repeated after this execution. The exact list, source snapshot/hashes, JSON report, stdout/stderr and exit are preserved under .results/task-2-78. Helper-only cases are not counted as full branded-path validation.

## Task 2/79 integration review and CI

Final review retains the two unresolved blockers above. Task2/78's 225-test run was checked against all 225 exact titles, exit0 and 46 unchanged implementation hashes; it was not rerun. Packaging changed only its inline git no-index whitespace-check exit interpretation (accept status0/1 with no diagnostics), not the Mocha runner, JSON aggregation or test results.

The existing Futures offline evaluation workflow adds one chain-free shared runner step selecting group new: fixed runner4 + shared reconciliation58 + identity17 = 79 tests. Existing input, settlement-link and V1 CI paths remain separate. The exact added CI command was validated locally in a separate execution: 79 PASS / 0 FAIL / 0 PENDING, exit0. These are two separate runs, not one 304-test execution. The workflow adds no RPC or chain call. Only source, fixed synthetic reference, reviewed test plans, tests, this documentation and the workflow are published; local raw logs and personal paths are excluded.
