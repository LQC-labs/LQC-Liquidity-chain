# longOpen actual-submission metadata connection — task 2/96

Base content: main 96f3bfb785316063598eac5682c517e3a2d16ff6, tree
f88b3110cbbf46d957373a042570094a4a074a92. The isolated branch starts at the
local tree-equivalent e554f0751927053037f55679fb41821a74d0e190. No remote fetch,
commit, push, chain scenario, RPC, contract or operating trust change is involved.

## Connection and source boundary

`loadLongOpenSubmission()` pairs existing private shared `open-gap` (base longOpen)
with private raw `long-open` (longOpen). It cross-checks original commitment and
query number/hash, then returns a branded context, actual shared submission and
auxiliary binding. No caller-supplied source registration is available.
`diagnoseLongOpenSubmission(context, request, binding)` requires that context,
original history commitment and exact query number/hash/timestamp. The submitted
scope query is also matched to the private query. An identical prefix segment ID
is insufficient: shortOpen and longOpen really share prefix IDs but have different
history commitments and Q. The dedicated mutation directly exercises this case.

Position and lot active sets, segmentId, phase, Epoch and period reuse the raw
binder. Raw participation yields position/Epoch and account/Epoch exact group
sets via the existing epochKey format; no funding amounts are calculated here.
The original shared reconciliation performs amount hierarchy checks. Its expected
amounts still share the original calculator, so these are not independent Funding
proofs. Monetary lot IDs and other inventory fields also remain subject to that
existing reconciliation path. Null required tables are explicitly unsupported by
this dedicated connection, rather than reported as checked.

Original raw participants remain separate from account projection. This single
open-gap source has no account aliases. The raw binder adds only the explicit
long-open case; old shortOpen mapping, fixed comparator/group guards, expected
JSON/pins, original calculator and loader bytes remain unchanged.

## Boundaries and scope

The actual original is O=100, E=200, D=100, Q block102050 at timestamp10200;
LONG300 and SHORT100 open at100, LONG closes at220, SHORT100 remains. Q is a
periodic boundary: pendingTail=null, without implying final financial completion.

The normal test does not adopt prior static counts as constants. A separate raw
census scans integer timestamps and raw lifetimes, without reading generated
segments/lots/catalog. It compares executed row/group/period counts against that
census. It shares input evidence and policy interpretation and is not a second
chain proof or general independent calculator. Execution confirms 102 intervals,
104 position rows, 104 lot rows, 103 position/Epoch groups, 103 account/Epoch groups,
and Gap periods1..100. Zero-debt/claim SHORT rows remain active after220.

Observed exposure (USD18 notional-seconds): official L=30000e18,S=10000e18;
Gap L=6000e18,S=1000000e18. These are exposures, not monetary obligations.

from/to, config, Q timestamp, pendingTail, remaining and observed integrals are
auxiliary original-source observations, not fields supplied by the shared schema.
`checkedSubmissionFields` is limited to the explicit submitted metadata; the
separate shared diagnosis describes its own broader checks. All authentication
and operational limits remain. The actual archived candidate is still covered by
the unchanged legacy regression, UNVERIFIED/PARTIAL/NOT_EVALUATED, amounts null.

The separate pending-tail helper changes ONLY its unauthenticated working query
timestamp to10150, leaving original files and records intact. Tail[10100,10150)
is observation-only. Missing tail and insertion into sealed intervals are separate
negative cases. Query header authenticity is deliberately not claimed for this
altered helper input, and no branded context is registered from it. These tests
are NOT actual longOpen/Q10200 submission-binding tests.

## Tests, exact targets and evidence

The reviewed fixed plan now contains the existing84 plus28 new titles. It retains
the existing separate expected-title hash and report validation, including
zero/missing/duplicate/unexpected selfchecks. The existing runner and workflow
already consume the plan and are not modified. The auxiliary offline guard is not
an OS-level network-sandbox guarantee.

- integration-1: 112 tests,111 PASS/1 FAIL,exit1,26175ms. Existing84 all PASS.
  The helper missing-tail negative test expected its target error, but canonical
  comparison of undefined raised NON_CANONICAL_TYPE first. Original logs and
  complete source snapshots remain preserved.
- Added an explicit hasOwn pendingTail guard to the NEW helper only. No test
  assertion, old guard, expected JSON, policy, timeout or monetary formula changed.
- impact-1: preparation failure resolving a relative runner import; Mocha did not
  start (0 tests). The original tool/result directory is preserved.
- impact-2:28 new tests PASS,0 FAIL,exit0,713ms. The isolated impact runner validates
  the complete pinned plan/file manifest before selecting exactly the new suite;
  it uses the existing report validator and preserves execution list and hashes.
  Only the new helper body changed after integration-1. Existing84 test/runtime
  paths do not import it, so they were not repeated. There is NO final single
  112-PASS execution claim; these are distinct runs with recorded source hashes.

Actual binding reverts/diagnostic errors: position/lot exact sets; valid-ID
phase/Epoch/period changes; position/account Epoch group omission/replacement;
original commitment; auxiliary Q number/hash/time; actual submitted Q scope;
and unexpected post-Q row membership. The post-Q row case reaches the exact
raw active-set guard, not a nonexistent submitted from/to range guard. Separate
amount drift passes metadata then reaches the reused shared amount hierarchy.
`long-open-target-errors.json` records the expected and actual first errors.

No success creates claims, consumption, transfers, return or LP recovery. Overall
status stays PARTIAL (or MISMATCH for bad amounts), NOT_EVALUATED, all confirmed,
payable, return and LP recovery amounts null and all eight execution authorities
false. Open obligations, chain/finality/price approval and persistent cash/ledger
proofs remain blockers. Existing Series are not admitted into new-policy scope.
QuickNode #24088 remains awaiting response/payment on hold at last confirmation.
