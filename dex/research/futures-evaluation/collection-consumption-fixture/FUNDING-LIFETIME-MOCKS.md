# FundingLifetime isolated mocks

Status: IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. All L01-L12 are NOT_RUN.

The actual `FundingLifetime` is imported directly. Only its instance-local clock,
timers and stderr sink are injectable. Defaults retain performance.now, native
timers, typed stderr serialization and the existing F01_BUDGET values. There are
no global timer, fs, provider or process stderr replacements.

Twelve cases cover normal hash capture and cleanup, the 120-second boundary,
underlying pending work after abort, late hashes after sealing, primary versus
journal errors, task/pending/session termination, cleanup timeout and late failure,
the 140-second initial record boundary, and guard ownership during restoration.
The 15-second evidence budget, 5-second termination/cleanup/terminal budgets and
180/200/210-second outer budgets are unchanged. Evidence writes in the full F01
hook shorten recordUntil separately; this unit suite does not execute that hook.

Plan titles and checkpoints are fixed. A per-instance manual clock uses ordered
callbacks with microtask checkpoints; owned deferreds really settle during harness
disposal. Harness disposal does not turn an unconfirmed scenario into success.
A scoped native unhandledRejection observer is removed finally. Per-case records
separate scenario checkpoints from post-disposal timer/listener/pending checks.

The one-shot runner verifies Node 22.23.3, plan and source pins, exact required,
actual and unique L01-L12 inventories, checkpoints, cleanup, child termination and
recording errors. The 45-second child runs in a 60-second Linux phase, after the
29 artifact mocks and before Anvil. Failure stops later phases as NOT_RUN.
Artifact collection requires logs and per-executed-case records, rejects malformed
or inconsistent records, and retains partial results on failure. Source snapshots
come from the pinned allowlist; build/results and local preparation tools are not
commit candidates. Existing workflow and its overall budget are unchanged; the
existing F01 start cutoff still applies.

No module evaluation, mock/test run, build, Anvil call, chain RPC, CI invocation or
publication was performed for this revision. Prior PASS results are not reused.
Native runtime behavior, Promise ordering and Linux artifact propagation remain
unverified. These units do not prove the complete F01 setup/Receipt/final hook,
transport cancellation, whole-process-tree termination or complete consumption
history. Executable amounts remain null, authorities false, and consumption/rights
links UNVERIFIED. No dedicated consumption Receipt or terminal is introduced.
