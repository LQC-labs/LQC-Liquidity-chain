# Settlement economic policy V1: first research implementation

This implements the user-approved clauses 1?8 of task 2/57 as **pure research
models**, not an executable settlement or deployment. Economic policy
`LQC_SETTLEMENT_POLICY_V1` and research calculator
`LQC_POLICY_V1_RESEARCH_CALCULATOR_1` are separate from PR #403's diagnostic V2.

Run from dex after its existing locked dependencies are available:

    node research/futures-evaluation/run-tests.cjs
    node research/futures-evaluation/run-policy-v1-tests.cjs

The first command preserves the original 234-test path and reference pins.
The second runs the separate V1 expected-test plan, syntax checks, JSON reporter
and exit-code validation. Every run uses a fresh ignored .results directory.
No chain, compiler, signer, package installation or network is used by these tests.

## Parameters and trust boundary

validatePolicyV1Config requires schema/version/ID, complete chain/contract/token
scope, decimals, O/E and contiguous official Epochs, positive D, explicit
nonnegative rational r in bp per D, both market and collateral price policies,
and explicit finality/history/state/independence requirements. Missing/null is
UNCONFIGURED, not zero. Explicit r=0 is valid syntax, never implicit approval.

Every synthetic numeric setting, feed and contract address is labeled test-only.
No operating asset/feed/price ID/r/D threshold is supplied by this change.
Configuration validity is CONFIGURED_NOT_APPROVED; activationAllowed is false.

V1 source capabilities are issued only by the fixed synthetic research loader.
The caller cannot provide its own expected source hash or manufacture a context.
Inventory, every original transition, final per-position quantities/counts/
Sequence, query scope and full-history commitment are compared to that separate
reference. This is source binding for tests, **not chain authentication**.
The real recorded candidate is diagnosed through the unchanged PR #403 verifier,
retains all blockers, and is explicitly ineligible for retroactive V1 application.
There is no independently verified new-Series production source importer here.

## Segmentation and Funding

Boundary union: every OI timestamp, all official Epoch ends including E, and O+kD.
D is never reset at E. Intervals are [a,b). All original-order changes at a are
applied to the next interval; the old OI accrues through b. Same-time intermediate
states have no duration. A query horizon that is not a real policy boundary is
an unsealed pending tail, not an arbitrary settlement boundary.

For constant interval OI L/S, Funding is exactly

    min(L,S) * abs(L-S)/(L+S) * r/10000 * (b-a)/D

with explicit zero for proven zero/matched-free/balanced exposure. The larger
side pays; its participants owe F*q/payerOI and the smaller side receives
F*q/receiverOI. Exact debtor/creditor, position, Epoch and closed-lot sums are
checked. Open remainder allocations are marked separately. They are diagnostics,
not consumed claims; a later lot partition does not create an additional debt.
Closed-segment position obligations/IDs are stable under a later horizon.

## History seal versus amount confirmation

History can be SEALED_SYNTHETIC_RESEARCH_ONLY independently of price checks.
Confirmed amounts always remain null: no independent finality/state/price proof
verifier or operating approval is asserted. Complete synthetic evidence may
produce explicitly test-only diagnostic amounts. Missing/stale/late/mixed price
evidence makes diagnosticAmounts null as well, with precise blockers.

Event boundary Funding prices are bound to the first OI-changing transaction at
that timestamp. Each entry/exit price is bound to its own record. Scheduled
boundaries require a block at/before the time and its consecutive successor
after the time, hash linkage, depth and exact historical-state commitment.
Reports must be available before the event/prestate or selected scheduled block;
a different otherwise-valid round cannot replace the pinned selection.
Primary/reference source, asset/ID, exact 18-decimal normalization, age, skew,
deviation and confidence are checked. approved=true is not an accepted input.

These are structural checks against synthetic records. A local descriptor or
boolean never becomes an independently authenticated chain/state/Oracle proof.

## Cumulative ledger and residuals

The Funding-to-ledger connector aggregates all converted complete-Series
segments by account before rounding. Open principal/pending tails cannot be
frozen into a final cumulative collection model. A new future obligation cannot
silently consume an existing overpayment refund: changing principal or version
is rejected on an existing model.

The lower-level model accepts explicit balanced debtor/creditor fractions for
an isolated Funding/PnL/fee bucket; it does not infer a loss-allocation or netting
policy. Exact principal is separate from integer collection, principal applied,
uncollected debt, payout, overpayment refund and unpaid creditor remainder.
Collection target=ceil(account principal), payout target=floor(account claim).
Receipt identities and cumulative sequence cannot be consumed twice. Recalculation
replays the same immutable model rather than processing the cash again.

For 7/5 raw collected as 2 and paid as 1:
cash=1, debtor unpaid=0, creditor remainder=2/5, payer refund=3/5.
One aggregate reservation backs both rights; each is not separately ceiled.
The invariant is cash + unpaid receivable = unpaid creditor rights + refund rights.
A receivable is never spendable cash. Multi-creditor shortage payout is blocked
without an approved allocation, rather than inventing a first-come/pro-rata rule.

A model can be MODEL_RECONCILED mathematically while actual financial settlement
is still false. Fractional residuals remain MODEL_OUTSTANDING. Rights assignment,
forced forfeiture, LP sweeps and fractional underlying transfers are not provided.
The model is an in-process immutable capability; arbitrary serialized summaries
cannot restore an authenticated consumption context. Durable real-cash journal
verification is outside this first implementation.

## Return diagnosis and limitations

Missing shared-independence or reserve-bound evidence returns unknown/null.
Fixed synthetic reconciliation assumptions may produce a diagnostic excess,
bound to account/pid/scope/history/policy and reconciled own Funding debt/previous
principal application. Actual returnAmount remains null. The source's synthetic
other-obligation/shared-reserve assumptions are not independently proven facts.

All outputs keep fundsAuthority, settlementAuthorized, createsClaim,
consumesHistory, returnAuthorized, heldUseAuthorized, lpRecoveryAuthorized and
rightsTransferAuthorized false. No contract/Registry/old Series/anchor/recorded
evidence is changed. No transfer, Held funding use, LP recovery, rights sale,
operating trust registration or deployment is connected.

Before operating use: independently authenticate complete new-Series chain
history, finality, historical state and Oracle evidence; explicitly approve every
asset parameter; prove shared-liability independence and reserve bounds; approve
any shortage/remaining-dispute procedure. This PR does not resolve those blockers.
Hashes and fixed test references identify bytes; they do not prove correctness.
offline-guard remains supplementary, not an OS-sandbox guarantee.
