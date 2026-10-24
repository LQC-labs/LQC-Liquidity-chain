# Linux one-shot consumption fixture validation

State: IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. No module evaluation, install,
compile, test, Anvil, CI or publication was performed to prepare these tools.
Existing Solidity, compile.cjs, build gate/build pins, 17 tests and their pins
are unchanged. Local node_modules junctions and private absolute paths are not
inputs to the Linux job. A fresh checkout must preserve approved source bytes;
line-ending or other checkout changes fail source/hash checks, never normalize.

## Future authorized invocation only

From this fixture in a clean Linux checkout, Node 22.23.3:

    npm ci --ignore-scripts --no-audit --no-fund
    node run-linux-once.cjs run
    node run-linux-once.cjs collect

The workflow records install stdout/stderr/status separately. Its run step is
conditional on installation success, collection/upload use if: always().
The new job has a 30-minute ceiling; install 3, run 24, collection 2 minutes.
Child limits: compile 180s, gate 30s, mocks 120s, real runner 930s (existing real
runner has its own 900s limit). No forceful process-tree cleanup is claimed.
Cancellation/job timeout can interrupt recording and upload.

The stored-data tamper phase follows a successful existing Anvil phase, once,
with a 60s parent limit and a 45s stored-data child limit. It never starts another
Anvil or creates a transaction. Including session mocks, phase ceilings total 1,380s within the
unchanged 24-minute run step. Earlier failure leaves it NOT_RUN. Its fixed nine
case IDs/titles, pins, raw logs, exit status, mutations and exact target assertion
locations are separate from the existing 17 Anvil tests and six error mocks.
No timeout or simultaneous-failure cases are added to those lists.

Future authorized offline use may pass the path of an existing Linux C05
normal-consumption.json to run-stored-consumption-tamper.cjs. With no argument,
the runner requires exactly one successful existing 17-test result directory and
reuses its C05 file. The historical run/file digest in stored-tamper-plan.json is
provenance, not a pin automatically assigned to future transaction bytes. Input
and fixed ABI bytes are hashed before/after, and the unchanged original is
verified again after the mutations. Missing/corrupt input or ABI mismatch fails.

Mutations edit a fresh encoded typed graph each time; no decode/re-encode clone
changes graph IDs, references or BigInt decimal types. Missing used/integer
cases remove only the before query plus its semantic and raw request/reply
pairs; retained events are unchanged apart from array indexes. The patch log
is replayed independently to reject undeclared changes. The trailing-response
case appends one 32-byte zero word: ethers rejects a one-byte suffix during ABI
decoding, which would not reach the required canonical re-encoding assertion.
Only ERR_ASSERTION with the pinned message and verifier stack line is accepted.
Preparation/parsing failures and any other rejection fail the case.

The new paths are IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. Source review does
not establish their runtime success. Stored consistency does not authenticate
RPC truth, a full consumption history, or a dedicated consumption Receipt or
terminal. Concurrent file-replacement and entire process-tree termination are
not proven. Amount null, authority false, consumption/rights links UNVERIFIED.

## Gates and failure boundaries

An independent normal-session phase runs once after the original six error
mocks and before the existing 17 Anvil tests. Eight unique cases import the
actual NormalEvidenceSession and the follow-up guard shared with the real
beforeEach hook. They use a per-instance fake monotonic clock, timers, RPC and
memory IO. Default native clock/fs/result-directory behavior is unchanged.
The 100s work, 140s write and 5s termination budgets are unchanged. When work
is unconfirmed, the cancelled guard is reinstalled and collectionPoisoned stays
true; only confirmed task/pending completion restores the original RPC.

The fake clock drains 16 microtask turns between due callbacks; progress and
pending/listener assertions detect insufficient progress rather than assuming
settlement. Owned deferreds are released explicitly during harness disposal;
that release is not transport cancellation by the session. Native globals are
not replaced. A scoped unhandledRejection observer is removed after the final
microtask/immediate checkpoint. Per-case checkpoints, post-cleanup states,
required/actual/unique lists, raw logs and exit status are required artifacts.
The new phase has a 60s limit, its child 45s, with no retry. Failure leaves later
Anvil/tamper phases NOT_RUN. The existing six mocks, 17 tests and nine tamper
cases remain separate. New session tests are IMPLEMENTED / STATIC_REVIEWED /
NOT_RUN; no past PASS validates them. No full transport cancellation, arbitrary
future promise behavior or entire process-tree termination is certified.

The root Linux dependency directory must be real, not a Windows junction.
The locked Linux Anvil 1.7.1 optional package/binary must exist; absent packages
do not authorize a fallback download or modified installation. Existing gate
checks exact lock/dependency/compiler/soljson and source hashes.
No existing build/, linux-once/, mock result directory or staging is reused.
compile runs once, followed by entire input/output/manifest SHA-256 checks
against linux-validation-plan.json, then the unchanged build gate in a separate
process. No metadata masking, field removal or automatic pin approval occurs.
Each subsequent stage runs once. Failure, signal, timeout, recording error,
hash mismatch or source mutation stops later stages as NOT_RUN. A compile that
exits zero but mismatches approved bytes is a failed phase, not a reviewed build.

## Separate mock evidence

Six isolated Mocha children cover exact BigInt assertion operands, nested causes
and AggregateError entries, evidence-only, cleanup-only and simultaneous final
hook failures, and reporter file-write failure with stderr fallback. The hook
checks first-error identity (including frozen Error), cleanup call count and
both recorded codes. Original assertions and the existing 17 tests are untouched.
Expected child statuses are not outer validation results. All expected status
and evidence checks must pass before the mock runner exits zero. No mock count
is added to the 17 Anvil result. Each child has raw logs/status; the outer mock
stage has separate raw logs/status and summary. No child is retried.

Installed Mocha 12 run-helpers.cjs registers an exit handler that resets status
from the Mocha failure count. Therefore the reporter-write case deliberately
expects CLI status zero for a passing test with failed report writing; it also
requires no readable report and a typed ENOENT stderr fallback. This is classified
as reporter failure, never a passing test run. The existing real runner rejects
missing/invalid reporter output even with a zero Mocha CLI status.

## Artifact allow list

Collection copies only named files: three build outputs, installation and phase
logs/status/summary, six mock case records, at most one real collection result
directory and one compile-result file, pinned sources and named source snapshots.
No recursive source/results upload or node_modules traversal is used. Every
source path component is lstat/realpath checked, links and root escape fail.
The new output staging directory is created exclusively; files use wx. Inventories
include copied paths/SHA-256, missing/not-applicable files and collection errors.
Missing success-required evidence fails collection; optional failure/success
records remain explicitly missing. Partial compilation/output is retained.
Workflow upload is only results/linux-artifact/, include-hidden-files false,
if-no-files-found error, retention 14 days. Collection/upload failure is not
continue-on-error. Secrets, dependency trees, local evidence helpers and private
provenance files are not in the allow list. No secret environment is configured.

## Review and remaining execution prerequisites

All source pin/review records describe static preparation only. Six mock cases,
Linux build reproducibility, real 17 tests, runtime/trace behavior and actual
failure cleanup remain NOT_RUN. The independent job preserves the workflow's
existing triggers/concurrency and other jobs. PR creation can naturally trigger
existing research jobs as well; their results remain separate. A later approval
must authorize publication/execution; no workflow run or PR is created here.
Before publication recheck latest main overlap, exact bytes, pins and upload list.
amount null; authority false; consumption/rights links UNVERIFIED.

## Publication repair: static only

All new-tool output directories are validated component by component before
creation or use. Invalid directory ancestry disables subsequent filesystem
recording; finally blocks use stderr instead of recreating/reusing that path.
Invalid individual output files are blocked without suppressing independent
records at other validated files. Existing files are never overwritten.
The mock runner independently attempts stdout, stderr and status writes. Any
recording error fails the outer validation and retains the original child result,
base64 raw buffers, primary error and every recording error on a safe file or
stderr. Case started/validation records and a final case-state summary distinguish
EXECUTED, RUNNING and NOT_RUN. No child is automatically retried.
The pinned evidenceRequirements list requires all pinned root sources, install
records, called-phase logs/status, called mock root records, each started/executed
case's logs/status/validation and applicable report/identity records. Called Anvil
also requires all pinned source snapshots; successful phases require their
additional build/test success records. Missing required files fail collection.
Manual use of collect must provide the same installation records as the workflow.
All these failure paths remain NOT_RUN. Path checks do not claim protection
against arbitrary concurrent filesystem replacement or guaranteed output when
all storage/stderr sinks fail. Whole-process-tree cleanup remains unproven.
