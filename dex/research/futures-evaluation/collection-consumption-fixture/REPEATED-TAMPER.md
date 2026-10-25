# R01 stored evidence pair tamper checks

IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. Base4c32801c2dc4ff1d68fb612775bb1229251016d7.

Use the unchanged verifyRepeatedConsumption/verifyRepeatedStep functions and fixed
ABI. Consume only step-1/step-2 evidence from successful R01 in the same Linux run;
the public runner has no alternate CLI input or historical fallback. No additional
Anvil, deployment, transaction, provider or RPC call is made.

| ID | Modification | Fixed verifier target |
| --- | --- | --- |
| V01 | Original ordered pair | Successful control |
| V02 | Swap the two original byte strings | line211 sequence2 versus1 |
| V03 | Remove previous specification used query from second before side, plus two semantic/two raw rows; retain saved specification | line128 QUERY_REQUIRED_LABELS:before |
| V04 | Remove second intermediate Coordinator transaction | line218 length1 versus2 |
| V05 | Integer transaction expectedAccountTarget10->0 in calldata only | line222 exact encoded input |
| V06 | First intermediate block parentHash away from first execute | line224 exact parent |

Every mutation starts from independent copies of both typed graphs. Resolve refs,
validate no dangling/duplicate IDs, declare paths/before/after values, independently
replay graph edits and input ordering, and hash both outputs. V02 preserves both
original byte strings exactly and changes only their order. Other cases keep the
first byte string unchanged and reserialize only the second graph. Stored BigInt
decimal tags remain intact. No default values, repair of invalid inputs or expected
rejection for preparation/parse/decode failures is allowed.

V02/V04/V05/V06 first require both individual step verifiers to pass, outside the
expected-rejection catch, isolating the pair linkage check. V03 explicitly targets
the fixed previous-specification query roster. Require AssertionError/ERR_ASSERTION,
operator, pinned verifier line, named message when present and exact numeric or
hex operands. V05 checks the exact original/changed ABI calldata; V06 checks both
the mutated and original parent hash. Source pins bind target lines to bytes.

The original pair is verified before and after all six cases; both inputs and ABI
are rehashed throughout. Record individual results, five mutation records, original
hashes, input order, actual error/stack/operands and remaining NOT_RUN IDs. One child
only,45s timeout; bail on failure; independent stdout/stderr/exit recording and
partial aggregate results. Required=actual=unique must be exactly V01..V06; recording
errors, abnormal exit, missing/duplicate reports or required artifacts fail the run.

Append one60s phase after successful R01. Refuse to start at/after22min30sec, leaving
30sec before the unchanged24min execution step. Existing R01 can start before20min;
there is no promise it leaves enough time, and this new stage may stop as NOT_RUN.
No timeout/trigger/workflow adjustment or automatic retry is introduced. Explicit
artifact allowlist: seven common files, six individual records, five mutations.
Existing link/path checks and source snapshot policy are retained.

Static checks only: sources/pins, mutation graphs and reference dependencies were
inspected as inert data from run40177433096 attempt1; three JS files syntax-parsed.
No new test/mutator/verifier module was evaluated, and no Anvil/CI/compile/install
was executed. All six results remain NOT_RUN. Exact assertion reachability, Promise
and timeout/error behavior, runtime source loading and artifact propagation require
a future authorized Linux run. Prior R01 PASS is an input provenance fact, not a
PASS for these six new checks.

R01 economic tests, verifier, helpers, previous suites, Solidity, build pins/gates,
dependencies and workflow are unchanged. Generated evidence/ZIPs and local helper
tools are excluded from publication. Amount null, authority false, consumption and
rights links UNVERIFIED. No complete consumption history, dedicated consumption
Receipt/terminal, RPC truth or whole-process-tree termination is certified.
