# Raw-history submission interval binding (task 2/91)

Scope: pinned synthetic sequential/partial cases only. The checkout's base is
`efba4343a0e5c2f4519653319bf9c4538581c683`, tree
`f40bd7c435f1586469d7cbfc154a656671edff07`, identical to the previously checked
main `898fb9de2ef17ed082ad3a34cad2d38bc762bb1a`. No new remote query or merge
commit reconstruction was performed. This is an uncommitted isolated branch.

## Data boundary

`loadVerifiedRawIntervalReference` invokes the existing private policy source
loader and `verifyPolicyV1History`. WeakMap branding rejects caller-created
references. It derives metadata from config, inventory, raw transitions and query;
it never reads calculator segments, lots, catalog, terminal or price results.
`deriveRawIntervalMetadata` is a public, explicitly UNAUTHENTICATED arithmetic
helper; it does not register a reference or confer source authenticity.
`bindRawSubmittedIntervals` additionally requires the existing branded shared
context and matches its original source commitment and query number/hash.

Original inventory identities remain in segment-ID participants. Synthetic account
projection is checked separately against the pinned shared source; it never
replaces original identities in source hashes. Segment serialization, hash helper,
policy commitment, period convention and prefix-at-to convention are deliberately
shared with the original format. Per-position raw replay independently derives
metadata, not cryptographic truth or independent policy interpretation.

## Boundaries and exposure

Cuts are the union of O, raw transition times, epoch ends and O+kD, clipped to Q.
The state after all same-timestamp transitions applies to [a,b). Original order is
retained and checked, with no interval of zero length. Q is not inserted as a
policy boundary. A non-boundary tail is observation-only and adds no fake close.
The pure shortOpen Q=250 helper test has a real transition at 220, so its tail is
[220,250), not [200,250). Its altered Q is synthetic helper input, not authenticated
source evidence; branded loader inputs remain unchanged.

Observed exposure uses both forward observed windows and the existing raw
integration-by-parts helper. For open positions, the latter adds terminal quantity
q(Q) times each window duration: integral = q(Q)*(b-a) + sum((old-next)*clipped(t-a)).
This is an algebraic correction, not a closing transaction. Both paths share raw
validation, BigInt parsing and policy boundaries; neither computes Funding money.
The first implementation requires Q >= E. No general multi-Epoch submission
support is claimed. Missing config, a pre-E observation or unsupported case fails.

## Actually connected fields and remaining PARTIAL scope

Position/lot segmentId, phase, epoch and period are checked against raw metadata;
position IDs, eligible raw lot membership, exact active row sets and submitted
transition contents/order are checked. Boundaries used for fixed comparisons now
come from the raw source, not calculator segment lookup. Monetary lot IDs remain
checked by the unchanged reconciliation path, not recomputed by this module.

The shared submission schema contains no from/to fields, config or Q timestamp.
These are explicitly auxiliary source evidence. The diagnostic does NOT claim to
have verified nonexistent submitted fields. `PARTIAL_FIXED_SUBMISSION` remains;
Q/config/integrals/openPositions/pendingTail remain unlinked as submitted fields.
The unchanged fixed JSON/pin still provide independent arithmetic expectations.

shortOpen Q=300 and shared longOpen Q=10200 are NOT connected. Open Gap validation
is helper-only; remaining positions, zero-money/nonzero exposure and pending tails
are retained. No new financial formula, price policy, rounding or authority exists.
Actual archived candidate remains UNVERIFIED/PARTIAL/NOT_EVALUATED, amounts null,
all execution permissions false. No REFUND, return or LP authorization is added.

## Execution evidence

Run `node run-fixed-independent-tests.cjs <fresh-output-directory>` from this
module directory with the existing installed dependencies. The independent manual
plan is pinned by SHA-256 and includes 84 explicit titles: 57 existing and 27 new.
Runner selfchecks reject zero/missing/duplicate/unexpected reports before Mocha.
The offline guard is supplemental; no OS sandbox authentication is claimed.

- integration-1: 79 tests, 78 PASS / 1 FAIL, exit 1. New tail test expected 200,
  overlooking the raw t=220 transition. Failure and source snapshot are preserved.
- integration-2: 84 tests, 84 PASS / 0 FAIL, exit 0; 22,874 ms. Tail expectation
  corrected to the actual raw history, five targeted checks added. No old
  assertion or guard was removed. These are distinct runs, not summed results.
- Existing 134 shared/version tests were not repeated: their modules, reference
  pins and tests are unchanged. Their prior PASS is not a new execution claim.

Actual binding tests cover phase/Epoch/period swaps for position and lot, exact
active row omission, same-timestamp submission reorder and private-reference
forgery. Boundary corruption, Q overrun, missing observation/remaining and tail
checks are helper checks, not nonexistent from/to-field submission tests. The
existing 57 checks exercise the full submitted projection and monetary comparators.
Test plan hashes are reviewed local pins, not protection against jointly replacing
both checker and plan. All raw/config/price/chain/ledger trust limitations remain.
