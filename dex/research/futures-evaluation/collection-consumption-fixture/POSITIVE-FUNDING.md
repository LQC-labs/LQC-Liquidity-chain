# Positive Funding: static preparation only

IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. One new economic scenario F01, separate from Anvil17, error mocks6, session mocks8 and tamper9. No executions are reported as PASS.

The inherited deployment/runtime/reverse binding tools are reused. Funding-zero ready, specify, execute, consumption assertions and saved verifier are not called. Shared observedSnapshot captures getters only; eleven additional LONG/invariant getters make 54 required queries per side. The separate verifier retains the fixed ABI and strict raw/canonical/saved-value checks and independently checks positive Funding accounting.

Independent inputs: delta-t=50-10=40s, LE=1e18*40, SE=3e18*40, matched=1e18*40. Funding USD18=(40e18*80e18*1)/(100*160e18*10000)=20000000000000/1. SHORT receives all payer debt and LONG all receiver claim: each 20e12*1e6/1e18=20/1 raw. SHORT signed PnL=3*(1-1.2)=-0.6 USD; positive loss raw=600000/1. Fee=0; total consumed=600020. Code asserts these rational results before comparing contracts.

Calls: normal policy registration (rate1, fee0) and LP/collateral approvals before origin; SHORT and LONG opens each at origin+10 sequence1; both full closes at origin+50 sequence2; cutoff at origin+100; checkpoint and fix both members; finalize only after done=participants=2 and materialized integral equality; process both Attribution histories; SHORT recordPlan/seal/budget600020/integer only; one owner execute sequence1. No LONG seal, payout or withdrawal.

Full-close clears Core's account-position mapping; the saved pid is used after closing. Timestamp mismatch, fraction/integer/limit/policy/link failure aborts before execute. No quote/storage/bytecode injection, impersonation or oracle validation relaxation.

The collection reuses NormalEvidenceSession with separate output names: 100s work, 140s evidence, 5s actual termination confirmation. It records raw RPC requests/replies immediately, hash before Receipt wait, UNKNOWN without retry, all snapshot calls/code at fixed block tags and repeated block hashes. Failure evidence precedes cleanup; pending work is not called terminated by Promise.race. No snapshot restoration is needed for this sole separate fixture. Cleanup is still attempted and failures remain separate; native uncooperative transports and whole process-tree termination are not certified.

Linux flow appends positive-funding once after compile/hash/gate/mock6/session8/Anvil17/tamper9. Child limit200s, phase210s; phase may start only before elapsed19min, leaving 90 seconds inside the existing 24min step after its maximum duration. Workflow is unchanged. A prior failure leaves the new phase NOT_RUN. Artifact collection uses explicit lists and the existing link/root checks. Required evidence missing or recording errors fail the phase/collection. Source snapshots are the existing artifact-root source allowlist; no node_modules, private paths or helper tools are added.

Run when separately authorized: node run-positive-funding.cjs (Linux Node22.23.3, reviewed build, approved installed dependencies, absent results/positive-funding). Not executed here; no installation/build/pin approval is performed.

Remaining verification: actual same-timestamp Anvil behavior and normal risk checks, both Attribution completion, exact integer budget/limits, one successful consume, all positive-Funding deltas, emitted logs, saved reread and failure/termination behavior. Existing mock lists do not cover all new evidence failures. Stored consistency does not authenticate RPC truth or complete history; no dedicated consumption Receipt/terminal or payable rights are created.

Known prior local sources searched: collection_consumption_static_20261024/work and current official archive. Existing zero-Funding Collector and protected-withdrawal tests provide tools, not this exact two-account600020 case. Other inaccessible/unsearched archives remain UNVERIFIED.

amount=null; authority=false; consumptionLink=UNVERIFIED; rightsLink=UNVERIFIED.

## repair-01 ? static review only

- Setup send stores UNKNOWN before submission, records the returned hash before Receipt polling, and distinguishes submission ambiguity, Receipt-query/validation failure, mined status0 failure and recording failure. A failed success/hash journal write never changes a mined transaction into a failed transaction. No retry is introduced. Setup RPC requests/replies and partial transactions remain available in the append-only journal and case-partial.json before cleanup.
- Instance-local FundingLifetime starts before setup, installs an RPC guard before provider initialization, tracks real task/RPC promises, and blocks new work after cancellation. FundingSession save/append additionally consult that lifetime, without changing the shared 100s/140s/5s defaults.
- Budgets: setup+collection work120s; actual-task/pending confirmation5s; partial evidence15s; cleanup5s; terminal recording5s (cooperative total150s). Mocha180s; child200s; Linux phase210s. Evidence window ends no later than start+140s and can close earlier after drain. The shared collection window can expire earlier; it never extends the outer work budget.
- Only confirmed termination permits shared-session and setup-guard restoration. Otherwise poison/cancelled guards remain installed. Recording is sealed before journal close and cleanup; late tasks cannot write journals or finalized files. Cleanup has its own observed promise and reports unconfirmed termination rather than claiming cancellation.
- Child timeout/SIGTERM, an uncooperative subprocess, blocked synchronous fs/event loop, CI cancellation and a hard-killed process may prevent terminal files. Partial artifacts are retained where produced; whole process-tree termination is not guaranteed. Timers bound cooperative waits, not arbitrary synchronous operations. Missing records do not become PASS.
- Stored verification additionally requires execution block parentHash == before.endBlock.hash, retaining height/transaction/Receipt/log checks. This is stored consistency, not RPC truth certification.
- Prior review mapping: its timeout/lifecycle issue is addressed by this lifetime path; its setup partial-query issue is covered by immediate guarded RPC capture and the pre-cleanup partial snapshot, but remains NOT_RUN. Its separate failure-artifact policy issue (all positive-* collection files mandatory after attempted collection failure) is not fully fixed in this scoped repair. The early setup hash and parentHash checks are additional, distinct requests.
- No new test cases or error-injection claims: F01 remains one case and NOT_RUN; Anvil17/error6/session8/tamper9 and protected files retain their bytes.

Static follow-up: the inherited deployment plan/artifacts/nonces/runtime checks remain, but F01 uses tracked ContractFactory.deploy and raw Receipt polling instead of the shared helper internal bounded races. The single execution Receipt uses this same tracked poller, without adding a transaction. Raw send hashes are retained in memory before fallible journal recording; late hashes after sealing use stderr only. The cancelled outer RPC guard remains through cleanup; the original RPC is restored only after work termination AND successful settled cleanup. A completed rejected cleanup does not count as successful cleanup.

## artifact-policy-01 ? IMPLEMENTED / STATIC_REVIEWED / NOT_RUN

Only evidence metadata and collector requirements change. F01 now records started/stage/validation/collectionState independently of overall success. The observation flag is set before the first positive-started write, so a file-creation failure cannot masquerade as setup-only failure. Shared lifetime, arithmetic, 54 required getters, parentHash and existing17/6/8/9 meanings are unchanged.

| Validated state | Required evidence |
| --- | --- |
| F01 entered, setup fails before observation | attempted list and case-failure; case-started, case-partial, case-state and Mocha must agree on started=false |
| Observation attempt, including initial file creation failure | attempted plus positive-started, positive-queries, positive-funding partial data and positive-state; missing any is collection FAIL |
| Observation collection failure | above plus positive-failure and overall case-failure |
| Verification not reached or failed | no successful positive-validation required; unexpected success artifact conflicts |
| Verifier returns successfully | positive-validation required, typed state PASS and evidence hash matched; still required if its write or later cleanup fails |
| Observation+verification success then cleanup failure | keep normal observation/validation artifacts, plus overall failure record; never infer NOT_RUN from overall FAIL |

Collector states begin UNKNOWN. Plain and typed records, journal JSONL, partial/terminal observation fields, required/actual/unique runner lists and Mocha outcomes are checked. Missing summary/terminal records, invalid JSON or state collisions fail collection. NOT_RUN requires valid agreeing no-call records, or setup-only failure records proving observation never began. Existing allowlist/link/root checks remain; required sets are state-conditioned subsets of the explicit allowlist. Original errors plus positive-state/positive-failure write errors are kept separately without replacing the first error.

Static review only: no state mutation, corruption, missing-artifact or cleanup-failure scenario was executed. This addresses the previously separate failure-artifact policy issue at code level, not as a runtime PASS. Prior repair-01 notes describe its historical state. No dedicated consumption Receipt, terminal, ledger completeness or payable right is introduced. amount=null; authority=false; consumptionLink/rightsLink=UNVERIFIED.
