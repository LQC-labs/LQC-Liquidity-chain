# Positive Funding stored-evidence tamper checks

IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. P01-P14 are all NOT_RUN.

Use the actual verifyPositiveFunding and fixed ABI with no provider, fixture,
RPC, deployment or Anvil import. The runner accepts no alternate input argument:
only results/positive-funding/positive-funding.json from this successful Linux F01
is selected after matching F01 runner and terminal records. Historical ZIPs are
static review material, never CI input. No extra transaction is introduced.

P01 is an unmodified control. P02-P09 cover missing specification used/integer
queries with their four associated observations removed, fixed getter/address/pid/
blockTag changes, noncanonical raw response bytes, and snapshot/raw disagreement.
P10 changes only Collected event amount from Funding 20 to total 600020.
P11 changes only saved Collected.amount to 600020. P12/P13 change execution parentHash
or Receipt transactionHash. P14 changes collected to 21 consistently in snapshot,
semantic return and canonical raw ABI response, targeting FUNDING_INCREASE:collected
rather than a preceding raw/snapshot comparison. P14 leaves cash/custody at 20.

Every case copies the original typed graph independently. A mutation manifest
records exact paths, old/new values and hashes; independent replay rejects any
undeclared edit. Graph/reference and decode errors are preparation failures,
never expected verifier rejections. Negative cases require AssertionError,
ERR_ASSERTION and the pinned verifier source location. Named assertions match
exact messages; unnamed economic/link assertions additionally match the operator.
P10/P11/P14 verify relevant actual/expected numeric operands. The unchanged original
is hash-checked throughout and reverified after all cases. The positive verifier,
its 54-query definition, economics, Solidity and fixed build remain unchanged.

The child budget is 45 seconds and separate Linux phase budget 60 seconds.
The phase runs once after F01; failure stops success propagation and retains partial
logs/exit/results. Explicit staging selects common artifacts plus per-case result
and negative mutation records. Applicable required evidence is checked separately;
missing, malformed, duplicate or conflicting results fail collection. The unchanged
F01 start cutoff leaves at most 23.5 minutes for execution including the new phase
within the existing 24-minute execution step, with no timer or workflow extension.

All original 17/6/8/29/12/9 lists and F01 remain separate. Prior PASS results do not
validate this revision. Static parsing does not execute modules or prove rejection
reachability. Runtime propagation and cancellation remain unverified. These checks
prove neither RPC truth nor complete consumption history, economic authorization,
dedicated consumption Receipt/terminal semantics or whole-process-tree termination.
Amount null, authority false, consumption/rights UNVERIFIED remain mandatory.
