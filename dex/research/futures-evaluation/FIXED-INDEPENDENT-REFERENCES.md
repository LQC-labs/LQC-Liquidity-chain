# Fixed synthetic independent shared references (task 2/85)

Scope: hand-check selected synthetic cases against existing outputs. No new economic policy, general Funding calculator, source registration API, chain authenticator, migration, refund execution, allocation policy or operating authority.

## Suitability and the two references

The existing `verifyPolicyV1History` checks first opening `timestamp < config.end` (`OPEN_AFTER_OFFICIAL_END`). The task2/84 proposal to open at E is withdrawn. No loader guard or private context is changed. The obligations reference is ONE bundle with THREE small existing-source subcases, rather than fabricating a new branded combined Series:

* sequential: existing flip50, O=100/E=200/D=100, turnover at150. Positions1/2 close before3/4 open at the same timestamp. Explicit existing shared-source synthetic account projection makes1/3 account A and2/4 B. It is not an actual onchain ownership change. Both new openings are before E.
* partial: existing partial, initial long300/short100, long reduces300->200 at150 and closes at200; short closes at200.
* open-gap: existing shortOpen, long300/short100 opened at100, long closes at220, short100 remains at Q timestamp300. No Gap opening. Only observations through Q are compared; future obligation and complete financial settlement remain unknown.

The separate cash reference is a ledger arithmetic example with explicit principals. Those principals are NOT claimed to follow from any of these Funding examples. The cash example is not submitted to the whole shared loader; the connection exercises supported existing ledger functions plus explicit synthetic event/owner/reservation projections.

## Hand derivation (not generated from calculator output)

For these already configured synthetic V1 examples, r=1bps and D=100. In whole USD notional units:

`F = min(L,S) * abs(L-S) * dt / (D*(L+S)*10000)`.

The fraction constants below and the JSON tables were manually specified in preparation. The preparation writer imports no evaluator and reads no generated segment, lot, catalog or terminal. Runtime only reads fixed tables and checks separate preparation-time SHA256 pins. It never updates the expectations.

### Sequential

[100,150): L300,S100: F=100*200*50/(100*400*10000)=1/400 USD; P1 debt, P2 claim.
[150,200): L100,S300: F=1/400; P4 debt, P3 claim.
Each position has one closing lot. Account A has debt1/400 AND claim1/400; B also has each1/400. They are not netted to zero. Domain gross debt=claim=1/200.
Official integrals L=300*50+100*50=20000, S=100*50+300*50=20000 USD-notional-seconds; Gap both0.

### Partial

[100,150): F=1/400. [150,200): F=100*100*50/(100*300*10000)=1/600.
P1's first100-quantity lot receives (100/300)*(1/400)=1/1200 debt. The final200-quantity lot receives (200/300)*(1/400)+1/600=1/300 debt. P2's single lot claim is1/400+1/600=1/240. P1 total is also1/240. JSON includes EVERY per-segment lot row, not just final totals.
Official integral L=300*50+200*50=25000, S=100*100=10000; Gap0.

### Open Gap

[100,200) official: F=1/200. [200,220) Gap: F=1/1000. [220,300) Gap: L0/S100, matched0, F=0 with an explicit remaining participant/lot row. Direction metadata is SHORT even when matched quantity and Funding are zero; zero is not a proof of future obligations being absent.
P1 closed lot debt=1/200 official plus1/1000 Gap. P2 open lot has corresponding claims, plus explicit zero in[220,300). Domain observed debt=claim=3/500.
Official integrals L30000/S10000; Gap L300*20=6000, S100*100=10000. Open position2 stays listed. E belongs to the Gap interval's start and the official interval's exclusive end; equal timestamp transitions add no duration.

Money tables are exact USD fractions; existing USD18 outputs are projected from USD18 to USD by multiplying the denominator by 10^18: n/(d*10^18). Quantity and integrals use the same explicit USD18 scale conversion. No floating point or rounding is used.

## Independent cash arithmetic

One official Epoch, zero initial cash and no external obligation in this synthetic Funding-only book. A debt7/5 raw, B debt3/5; C claim8/5, D claim2/5. Gross debt=claim=2. Existing ledger receives A COLLECT2, B COLLECT1, C PAY1, with no D payment and no REFUND event.

| Stage | Cash | Uncollected | Unpaid claims | Overpayment-return rights |
|---|---:|---:|---:|---:|
| initial |0|2|2|0|
| A collect2 |2|3/5|2|3/5|
| B collect1 |3|0|2|1|
| C pay1 |2|0|1|1|

Each row satisfies cash+uncollected=unpaid+overpayment. Final C remaining3/5,D2/5,A refund-right3/5,B2/5. Reserved2 equals the actual cash2, not cash plus reservation. Disjoint synthetic cash intervals A[0,3/5), B[3/5,1), C[1,8/5), D[8/5,2) bind account/position/obligation/token/right separately. These intervals are bookkeeping projections, not proof of real cash independence or a new allocation policy.

The unchanged hand-fixed event and terminal expectations are compared against a single synthetic raw-event projection and model-derived aggregate amounts: A COLLECT seq1 cumulative2/R1, B COLLECT seq1 cumulative1/R2, C PAY seq1 cumulative1/R3. A single synthetic TX has distinct log indices0/1/2. D has no payment event; D's remaining claim is2/5, not zero. The connection calls existing entriesState for supported terminal arithmetic. The labels R1/TX are explicitly synthetic identifiers, not actual authenticated Receipts. No REFUND support or full rights completion is added. Multi-Epoch cash and fractional multi-position cash routing retain their original explicit rejection.

## Comparator, connection and limits

`fixed-independent-comparator.mjs` accepts diagnostic tables only and never creates a trusted/private context. It requires exact fields and row sets, preserves raw global order, rejects sparse/duplicate rows, and compares unsigned decimal-string fractions using BigInt cross products after a positive-denominator check. Equivalent unreduced fractions are accepted without relying on the existing reducer. No missing value is replaced by zero.

`fixed-independent-connection.mjs` uses existing private loaders and evaluators for observed outputs. Only the submitted side is projected/aggregated from those outputs; the expected side is fixed. The branded shared connection now reads actual submitted inventory, lot/position postings and position/account-Epoch tables. Fields absent from the submitted schema remain explicitly unlinked; calculator segment-ID lookup remains a declared dependency. These joins are not a second calculation. Raw-reference fields are semantic transition/order/quantity fields; full original Receipt/block/source validation remains the existing loader's job, not independent authentication by this comparator.

Negative direct tests keep reference bytes unchanged and supply the same corrupted calculated/submitted views. Quantity scaling doubles all quantities, integrals and monetary layers; amount scaling doubles Funding and every posting level while keeping debt=claim. Fixed expected values reject these otherwise balanced substitutions. Other tests isolate direction, boundary, owner, exact-set omission, lot amount, event identity, terminal and reservation errors. They assert the first comparator field/error, not a reference-file hash failure. These are comparator tests; they do not bypass a private context to insert bad runtime sources into the existing evaluator.

The references are synthetic. Their manual interpretation, JS integer parsing, unit projection and policy interpretation can still share conceptual mistakes; a separate file or file hash does not prove correctness. Fixed local pins do not prevent jointly changing the checker and pins. No general-input accuracy, real inventory completeness, chain/finality, approved price, persistent ledger, independent different-implementation reevaluation, or refund/right execution is certified. Legacy Series are not reinterpreted as V1.

Every comparison remains NOT_EVALUATED, all confirmed/payable/return/LP recovery amounts null, all execution permissions false, rightsTransitionComplete=false. The actual archived legacy candidate stays UNVERIFIED.

## Execution

From dex, with already installed local dependencies only:

`node research/futures-evaluation/run-fixed-independent-tests.cjs`

Supply a new output directory as the first argument to preserve previous logs. The independent manually maintained title plan and reviewed file hash reject test omission. The runner checks zero/missing/duplicate/unexpected reports before spawning Mocha, uses the JSON reporter, verifies exit code and exact title sets, and preserves snapshots/hashes/failed logs locally. offline-guard is an auxiliary process-level defense, not an OS-enforced offline sandbox. No RPC or chain runner is attached.

QuickNode #24088 remains awaiting reply/payment on hold at last confirmation.

## Task2/87 linkage corrections

The expected JSON tables and their original byte pins are unchanged. The original coarse group display IDs in those tables are projected to a diagnostic key binding owner + phase + Epoch + Gap period; no monetary expectation is regenerated. Only the currently fixed official Epoch1 and Gap period1 are supported.

Actual shared submissions now supply their own accounts, inventory positions/transitions/lots, per-segment position and lot postings, position/Epoch rows, and account/Epoch rows. None is copied from the calculator view. Identity on the amount-only position/Epoch rows is decoded from the submitted group ID and joined to the submitted position inventory. Segment from/to still needs the existing calculator's segment-ID lookup and is explicitly identified as that dependency. Missing query timestamp, configuration, independent segments/integrals and open-tail fields stay unlinked with reasons. Block number/hash observation is preserved separately, without inventing a Q timestamp. A partial connection is never whole-submission verification. The optional submitted diagnostic argument never registers a context, rewrites original evidence or authenticates a ledger.

One fixed synthetic raw event list now drives both ledger inputs and book-event representations. A separate explicit linkage check compares amount, owner, operation, global/group Sequence, position/obligation, Receipt, transaction/log/item identity and terminal. The ledger event ID commits the complete synthetic raw row, including metadata the arithmetic ledger does not store itself. Terminals retain the existing entriesState calculation. This authenticates no real Receipt and adds no REFUND execution. Both builder and link checker still share helper interpretation; the separate unchanged hand-fixed cash table remains the arithmetic expectation.

Direction, boundary, ownership and paired-omission mutants now propagate into related lot/position/account totals and assert gross flow and hierarchy conservation before the fixed comparison. They intentionally remain inconsistent with the untouched original expected scenario in the target dimension. Paired omission is checked both at the calculated Funding total and, separately, at the submitted exact obligation set. Direct synthetic projection helpers, actual branded shared-submission calls, raw-event linkage checks and fixed-file byte checks are separately classified. The fixed reservation-interval test is an exact-case comparison, not a general overlap algorithm test.

No aggregate result becomes financially evaluated, payable or returnable. All execution amounts remain null and permissions false. Unconnected fields, actual inventory/chain/price/ledger authenticity, general correctness, fractional multi-position cash routing and REFUND/right execution remain unproven or unsupported. Existing synthetic account projection is still explicit. QuickNode #24088 remains awaiting reply/payment on hold.

## Task2/87 recorded execution scope

The independent runner's fixed plan selects34 retained/strengthened cases plus23 new linkage cases in ONE run. The earlier2/85 logs remain untouched. A separate shared-regression run selects134 existing cases (runner4, shared58, identities17, version correspondence40, origin/rights15); results are reported separately, never as one combined execution. Sources, full executed title lists, exit codes, source snapshots, fixed-byte comparisons and direct-error classifications are preserved in local results only.
## Task2/101: same private ledger rights/recalculation connection

Scope is the existing fixed cash arithmetic case only. The previous whole-ledger
recalculate equality test and the fixed comparator's individual right/reservation
checks already exist and are reused, not reimplemented. The missing connection
was recalculating the same private model, projecting that result and linking the
before/after books and optional submitted book to the unchanged hand-fixed table.

`diagnoseFixedCashRecalculation()` internally constructs the original fixed
private model, uses `recalculatePolicyV1Ledger(model)` and checks its binding and
Sequence. The old projection is extracted into a private helper and reused for
before and recalculated model outputs. The old observeFixedCashLedger interface
and its resulting values remain unchanged. No new financial formula, rounding,
reservation policy, source registration or ledger API is added. Only the existing
connection library has implementation changes; the ledger, comparator, fixed
cash/obligation JSON and reference pin bytes are unchanged.

A no-argument call means source-model recalculation, NOT a submitted-evidence
check (`submittedEvidenceState=NOT_REQUESTED`). An explicit null/undefined or
missing/null required field remains UNVERIFIED/MISSING with
`diagnosticSubmittedRights=null`; it is not filled with zero. A complete submitted
view is checked by the existing fixed comparator. An empty rights list contradicts
the independently fixed positive rights and is rejected. Caller approval fields
do not expand the fixed schema. Output financial execution amounts stay null and
all authorities false in every returned result.

Right identities remain the existing fixed labels account/pid/obligation/token/
kind. They are NOT rewritten to version catalog keys. A,B refund rights remain
3/5,2/5 raw; C,D unpaid funded claims remain3/5,2/5 raw. Four right rows reserve
cash2 exactly; fractional components are not added as extra liabilities. The
returned modelRightsPreserved flag only describes this internal fixed private
model, never an absent submitted table, real persistent state or version bridge.

Book Receipt/events/terminals are the existing validated source event projection,
not independently re-read private ledger Receipt records. The unchanged private
recalculation function retains its stored spec/events; actual model Sequence,
collected/paid balances and derived rights are projected after recalculation.
Submitted Receipt/terminal mutations are checked against the fixed source via the
existing comparator. No independent chain/Receipt/ledger authenticity is claimed.
Reservations are checked as this fixed exact case, not a new general overlap
algorithm. Existing general overlap/owner checks are unchanged.

Tests: integration-1 executes105 tests in one run: existing34 reference +23
submitted/event links +27 raw-interval checks, plus21 new recalculation-connection
checks.105 PASS/0 FAIL,exit0,24053ms. The unaffected longOpen28 are not repeated;
there is no full133-pass execution claim. The fixed required plan contains133
reviewed literal titles so the original CI runner will include all suites when
run; no workflow/runner implementation change is needed. The isolated impact tool
validates the full pinned plan/file manifest before excluding the longOpen suite,
then uses the existing JSON reporter/list/exit-code validator. Its source snapshot,
syntax results, stdout/stderr, exact execution list and target errors are kept
locally. No earlier failed/preparation evidence is overwritten.

Direct targets include positive refund fraction loss, duplicate right set,
owner/obligation/token replacement, unpaid fractional claim omission, fixed-case
reservation interval overlap, duplicate event set, coherent Receipt substitution,
collection/payment/terminal reset, missing evidence and empty-positive-right
contradiction. All mutations enter through the new submitted-view connection;
existing comparator errors are retained, rather than adding parallel arithmetic.

Base content is main55e57b16d223828dab0e1dda4fbbbeb1c0e9a92c, tree
a2a585fc6e8aff4f49b74109ba9cd8c81522a7ab (local tree-equivalent parent
c2bf3775db3d669bc3ed36fcfbe4e65e356b121b). No remote query was needed.
The actual archived candidate remains UNVERIFIED/PARTIAL/NOT_EVALUATED. No catalog
is equated to the hand cash principals, no key is migrated, and no registered
before/after evaluation right transfer is supported. rightsTransitionComplete is
false, actualEvaluationRightsLinkage UNVERIFIED, refundSupported false. No REFUND
consumption/transfer, actual money/return/LP authority, contract, anchor, operational
trust or economic policy is changed. QuickNode#24088 stays pending/payment on hold.
