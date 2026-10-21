# Fixed-Q stored-history bridge (local research only)

Base: adc3384324112986f3cd2a3d005b573b5aa8d8ad. No production contract,
existing candidate anchor, private loader, fixed build pin or original test plan
is changed. This is a new execution, not a reconstruction of an earlier run.

Run from this directory: `node run-fixed-q-tests.cjs` after the existing pinned
build/dependencies are present. The original build gate runs before Mocha/Anvil.
`fixed-q-test-plan.json` is a separately enumerated 21-title plan (16 retained bridge checks plus five research-output checks); its reviewed
hash is in `fixed-q-test-pins.cjs`. The runner never updates either file. The plan
also fixes the bridge and existing JS helper sources. Replacing runner, plan and
pin together is outside this local integrity boundary, not an attack it prevents.

## Scope and trust

`bridge-fixture.mjs` reuses the original actual-contract setup/open/partial/final
scenario with 3 USD18 notional, closing 1 then 2, before E. The financial sources
and original test assertions are unchanged. It records transaction hashes and
constructs expected full runtimes from the pinned compiler output and explicit
deployment values (including immutables). Code responses are not adopted as pins.
The policy identifier is the fixture's fixed `GAP_LOCAL_ONLY`, not an approval.

`observeFixedQ` requires a fixture-branded context. It chooses a fresh local Q,
records chain/header before and after, and journals requests and raw responses
immediately, including errors. All 30 final code/state/inspect requests explicitly
use Q. Transaction Receipts are queried by their exact fixture transaction hashes;
their block headers are queried by number. These transaction lookups do not take
an eth_call blockTag: the bridge instead requires status 1, block <= Q, matching
block numbers/hashes and Recorded event/transition/time linkage. Local RPC and
the test process remain trusted transport; this is not independent chain proof.

Q is an observed run coordinate, not an approved chain anchor. Contract addresses
are the fixture's deployments; expected runtime bytes come from reviewed source
artifacts and explicit constructor/immutable values. Domain 2, Series 1, pid 1,
LONG, 3e18 initial quantity, 100-second single Epoch and the local research policy
are fixed scenario constraints. The source key is independently reconstructed
from those constraints and the deployed identities, not accepted from a report.

## JS connection

The boundary checks raw code, connections, Core/Basis/Trace, account log, complete
ordered transitions, LinkedExit, business Receipts and terminal state. The Solidity
ABI rolling commitment is reconstructed from the raw query bytes in its original
format. The JS commitment uses the existing canonical JSON commitment helper with
the separate LOCAL_STORED_HISTORY_JS_MEANING_1 namespace. Neither changes or replaces
the original candidate semantic commitment; the two hashes need not be equal.

The checked transitions and prices connect to existing `integrateHistory` and
`compareMockConditions`. No new Funding, price, PnL or rounding formula is added.
The observed official exposure is 3e18*10 + 2e18*10 = 50e18 notional-seconds.
No recorded aggregate-integral proof is asserted. Missing Coordinator evidence
stays UNVERIFIED. No existing candidate-loader context is minted or modified.

Public mutation helpers are explicitly test-only. They require the private run
context and cannot create one from caller-provided historyMatches/commitment.
Their tests alter transport representations using that run's reference; they
demonstrate target comparisons, not RPC authenticity or adversarial node safety.
Runtime and query-scope rejection are front-boundary tests; Sequence, business
Receipt, quantity, stored timestamp and reconstructed commitment checks are
separately identified in direct-rejection-points.json.

## Executions and preserved limitations

One preparation-path ENOENT occurred before any Anvil launch. The first chain
execution failed its setup comparison because ethers Result.length is array
length, not the ABI field named length. The bridge now explicitly uses cfg[3].
That failed run remains in results/fixed-q-1792510142148 (0 tests, 1 hook failure).
Three separate intermediate runs each passed 16 tests. After adding existing JS
helper connections, fixed scenario-policy/key checks, explicit output contract
scope, transaction/log block linkage and isolated private-reference copies, the final run
results/fixed-q-1792510536386 passed 16/16, zero pending/failures, exit 0. The
separate settlement-link regression passed 61/61 (13 runner + 48 diagnosis).
These are separate executions, not a single combined 77-test run.

The original 29-title plan, original verifier/fixture Solidity and build pins
are preserved. Existing pinned build artifacts and the task 2/112 installation
were reused after the gate verified them: this task is not a fresh installation
or new compilation demonstration. No existing contract test suite was claimed
as rerun merely because its source hash matched.

Only the selected complete, single-position account case is supported. Open
history, multiple positions, Registry/TradingCore authentication, chain finality,
Oracle, economic-policy/Funding authentication and persistent consumption remain
outside this bridge. Confirmed/return amounts remain null, evaluation status is
NOT_EVALUATED, all execution authorities false. No settlement, payment, claim,
consumption, Held use, return or LP recovery is enabled. No external RPC, service,
trust registration, commit, push, PR or deployment beyond local tests is added.

Returned observations and diagnosis Q objects are separate from the private expected
Q/request plan. The final reproducibility test mutates those returned objects and
checks both rejection of the mutation and preservation of the original private run.

## Task 2/117 CI preparation

The dedicated stored-exit-history-research job now invokes
`node run-fixed-q-tests.cjs` after the original 29-test command. Existing suites
are not duplicated. The added command was validated once locally: 16 PASS, zero
failures/pending, exit 0; this is separate from both prior 16-test executions and
the previously recorded 61-test regression. GitHub CI has not been run for this
uncommitted change. The local installation/build were reused, not freshly installed.

A real nested-package resolution issue was found: the parent JS helpers import
ethers from dex/node_modules, while this job installs only in the nested harness.
After the pinned build/source/syntax gates, the runner creates an ignored parent
node_modules resolution link to the same checked installation if absent. An
existing different tree is rejected before Mocha/Anvil; it is never overwritten.
No package installation, lock change or dependency upgrade is added. The local
check began with this parent link absent and verified its creation. Windows was
validated locally; this task does not claim a new Linux CI execution.

Each run chooses Q anew. Block number 39 happened to recur for this deterministic
scenario, while block hash/timestamp and run ID differ. Neither a historical Q
hash nor any historical commitment is a general CI expected value. Q/hash
consistency does not authenticate finality. The 26 archived Receipts cover the
fixture mined() calls, not its ten external deployment transactions or a complete
creation genealogy. Receipt roles are determined by fixture call order and
recorded targets/events; raw transaction calldata was not collected. Recorded
event order is checked for this one-opening/two-exit case, not as a general
multiple-events-per-transaction log ordering validator.

## Task 2/121: existing-calculator research output

A new isolated run adds one explicit-Q Core.domain view. Token, decimals and
Oracle addresses are compared against the fixed local fixture before use. The
existing private raw-history/ABI commitment checks remain; the domain response
is additionally covered by the separately named JS semantic commitment.

The checked Basis entry price, per-exit quantities/prices and observed decimals
form the existing evaluateDiagnostics input. No PnL/Funding/rounding formula is
added or modified. Existing integrateHistory is reused inside that calculator;
Mock comparison remains unverified without Coordinator evidence. The scope is
EXISTING_SERIES_LOCAL_PNL_RESEARCH_ONLY, never new economic-policy V1 approval.

For the selected LONG case: leg 1 diagnostic USD gain 0.1 and raw-token fraction
1000000/9; leg 2 gain 0.4 and 500000/1; raw gain total 5500000/9, rather than
625000/1 from applying the last collateral price to the whole USD gain. No
integerization or netting authorization is inferred from these diagnostic values.

Funding, fees, authoritative account limit, prior consumed amount, remaining
limit, rights and reservations stay null/UNVERIFIED. Missing evidence is not
zero Funding. Repeated calculation preserves the native position binding and
evaluation identity for unchanged input; no ledger write, reset, new claim,
refund, Held use, return or LP action is implemented. All execution rights stay
false and financial confirmation stays NOT_EVALUATED/null.

Actual task 2/121 executions: new bridge/research suite 21 PASS, exit 0, 4424 ms;
separate unchanged evaluator regression 51 PASS, exit 0, 7157 ms. Exact lists
were checked against the updated fixed plan and the existing pinned suite-plan
respectively. They are not one combined 72-test run. One directory preparation
ENOENT occurred before tests; it was corrected without starting Anvil. Existing
compiler output and installed dependencies were reused after the original build
gate; there was no new installation or compilation, and no public RPC or GitHub
publication. The original 29-test plan, financial fixtures and anchors are unchanged.

## Stored direction and SHORT local research

The bridge requires the canonical stored Trace ABI bool (0 or 1), binds it to the private fixture direction and checks both OI columns. Missing and noncanonical words fail before decoding; no stored direction defaults to LONG. The fixture's existing LONG default is only the chosen test scenario, never a missing-evidence fallback. A second actual local deployment explicitly opens SHORT and partially/finally closes it. Same-Q, Runtime, private context and both original commitment formats are unchanged.

Independent arithmetic: q18 is USD18 notional. SHORT USD18 PnL = q18*(entry-market)/entry. For entry=1, partial q=1 at market=1.1 and collateral=0.9 yields -0.1 USD and -1,000,000/9 collateral raw (6 decimals). Remaining q=2 at market=1.2 and collateral=0.8 yields -0.4 USD and -500,000 raw. Signed sum=-5,500,000/9 raw; loss magnitude=+5,500,000/9; gain=0. LONG retains the opposite signed gains. Exposure is 3*10+2*10=50 USD18-seconds on SHORT, zero on LONG. No integerization or gain/loss netting authorization is introduced.

Execution inventory: existing 21 LONG/boundary checks and 9 SHORT checks, 30 total in the existing CI command `node run-fixed-q-tests.cjs`. Negative transport mutations use the private run reference and assert their exact target, not an earlier commitment failure. They are not external chain authentication. Prices remain local mocks, Funding/account/rights evidence missing, NOT_EVALUATED, confirmed/return amounts null and execution authorities false. Solidity, policies, evaluator formulas and build pins are unchanged.

## Falling-price SHORT profit scenario

The fixture retains LONG and RISING defaults. An explicit SHORT/FALLING local scenario uses market 1 -> 0.9 -> 0.8, unchanged collateral prices 1 -> 0.9 -> 0.8, and unchanged quantities/times: open 3 USD notional, close 1 at start+10 and remaining 2 at start+20. Existing bridge, private context, both commitments, calculator, Solidity, policy and build pins are unchanged.

Independent arithmetic (not generated from results): SHORT USD PnL=q*(entry-market)/entry. The two legs are +1/10 and +2/5 USD, or +10^17 and +4*10^17 USD18. Six-decimal collateral raw fractions are +(1/10)/(9/10)*10^6=1,000,000/9 and +(2/5)/(4/5)*10^6=500,000. Signed raw total and positive gain are 5,500,000/9; USD18 total/gain=500000000000000000/1; both loss totals=0/1. No integerization or netting authority is added.

The fixed inventory is 33 tests: unchanged prior 30 plus 3 actual falling-price SHORT connection checks. Run the existing command `node run-fixed-q-tests.cjs`; raw observations, journal, diagnosis, actual titles, exit code and source hashes are saved separately from sources. The new case checks stored SHORT, both OI columns, Sequence, business Receipts, actual 10/20-second offsets, per-exit prices, fixed-Q consistency and safety outputs. A positive diagnostic is not an executable payment. Oracle/policy/Funding/consumption/account evidence remains unauthenticated or missing; NOT_EVALUATED, null confirmed/return amounts and false authorities remain in force.

## Mixed-profit/loss SHORT scenario

The explicit MIXED fixture keeps existing LONG/RISING defaults and RISING/FALLING cases unchanged. Market prices are 1 -> 0.9 -> 1.2; collateral prices remain 1 -> 0.9 -> 0.8. A real local SHORT opens 3 USD notional, closes 1 at start+10 and closes 2 at start+20. Raw stored direction, both OI columns, prices, times, Sequence and business Receipts pass the unchanged private fixed-Q bridge and calculator. This is not a fabricated positive diagnostic packet.

Independent arithmetic, fixed before execution: SHORT PnL=q*(entry-market)/entry gives +1/10 and -2/5 USD. At 6 collateral decimals, raw fractions are +(1/10)/(9/10)*10^6=1000000/9 and -(2/5)/(4/5)*10^6=-500000/1. Signed raw total=(1000000-4500000)/9=-3500000/9; gross gain=1000000/9 and gross loss=500000/1. USD18 signed total=-300000000000000000/1, gain=100000000000000000/1, loss=400000000000000000/1. Net is diagnostic arithmetic only; nettingAuthorized=false. No integerization or economic netting permission is introduced.

The fixed inventory is 36 checks: unchanged previous 33 plus 3 mixed-PnL checks. The existing `node run-fixed-q-tests.cjs` saves raw observations, journal, diagnosis, executed titles, source hashes and exit status. The scenario confirms NOT_EVALUATED, null confirmed/payable/return amounts and false execution authorities. Oracle, policy, Funding, account limits and persistent consumption remain unauthenticated or missing. Existing bridge, evaluator, Solidity, economic policy and build pins are unchanged.

## Stored price and price-time negative checks

Five checks reuse the first fixture's real private fixed-Q observation and existing mutation helper; no additional fixture or chain scenario is added. Each mutates exactly one ABI field of exit2: market=0, collateral=0, marketTime=exitTime+1, collateralTime=exitTime+1, or positive market=oldMarket+1. The first four must fail exactly at STORED_PRICE_TIME; the fifth keeps the original inspect commitment and must fail at SOLIDITY_COMMITMENT. Existing report-commitment mutation coverage is distinct and remains unchanged.

Each check compares all ABI words and the restored whole packet to prove a single-field mutation, checks the inspect response is unchanged, records the actual rejection, and rechecks the untouched private packet and full diagnosis after rejection. NOT_EVALUATED, null confirmed/payable/return amounts, false authorities and nettingAuthorized=false are retained. The positive-price test checks binding of recorded price bytes to the existing reconstructed commitment. It does not authenticate an Oracle price or prove defense against a malicious node.

The existing command `node run-fixed-q-tests.cjs` now requires 41 unique checks: all prior 36 plus these 5. Fixed titles, plan pin, source hashes, actual execution set and exit status are checked by the runner. Target evidence is saved in direct-rejection-points.json with the field index, before/after words and actual error. Fixture, bridge, evaluator, Solidity, economic policy and build pins remain unchanged.
