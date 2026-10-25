# G01: positive fee in linked-exposure collection

IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. This is one separate local research case; no test or module evaluation has been performed for this revision.

## Fixed inputs and independent expectations

Create a new Domain before origin with feeBps=1 and policyDigest=keccak256("POSITIVE_FEE_TWO_ACCOUNTS"). Keep SHORT size=3e18, LONG size=1e18, opening price=1e18, exit price=1.2e18, collateral price=1e18, token decimals=6, Epoch=100 seconds and rate=1. Both positions open at origin+10 and close at origin+50; reject mismatched actual timestamps. Exposure sequences are 1 then 2. Fix both accounts' checkpoints and members, require done=participants=2 and equal materialized integrals, finish both Attribution histories, and create only the SHORT plan/seal/budget/integer specification.

Independent raw amounts: PnL=3*(1.2-1)*1e6=600000; Funding USD18=matched*(SE-LE)/(100*(LE+SE)*10000)=20000000000000, raw Funding=20; fee=3e18*1/10000*1e6/1e18=300. Budget and aggregate consumption=600320. Funding account/position limits remain 20, not 600320. Consume once as the owner at execution Sequence 1. No LONG plan, payout or withdrawal is added.

## One-transaction accounting

Executor pnl/funding/fee increments are 600000/20/300. linkedConsumed increases 600320 and linkedHeld decreases 600320. Partial pool.lp increases 600000 and pool.fees increases 300. Partial token balance/cash/tokenAccounted decrease only 20; Funding balance/repeatCash/repeatCustody/repeatAccountCollected increase 20. Collected.amount=20 means Funding only, never total consumption. Other pool fields, wallet balances, LP shares and LONG state remain unchanged. Allowances and both executor authorizations end at zero.

## Saved evidence

Use a separate result directory results/positive-fee and G01 ID, independent of F01. Preserve setup request/hash-before-Receipt/Receipt/block records and partial failures. Reuse NormalEvidenceSession, observedSnapshot and FundingLifetime unchanged. Add one block-fixed core.domain query to the existing 54-query shape: exactly 55 expected queries on each side, constructed inside the separate verifier from fixed getter/role definitions. Verify request labels, addresses, ABI methods/args/calldata/blockTag, canonical raw result encodings and saved values. Decode the Domain Config with the fixed ABI; require feeBps=1 and the fixed policy digest, and require the Domain unchanged across consumption. Recompute specification/key, arithmetic and transaction/Receipt/log linkage using saved bytes and the hash-fixed ABI, without a live fixture/provider.

## Boundaries and failure preservation

This uses openLinkedExposureResearch/reduceExposureResearch and the normal linked research verifiers. Their guards remain active. It does not test ordinary openPosition opening-fee charging or claim its full risk coverage. No quote/storage/bytecode injection, impersonation, production deployment or external chain call is introduced.

FundingLifetime and F01_BUDGET are reused without changes: setup+work120s, termination confirmation5s, partial evidence15s, cleanup5s, terminal record5s; Mocha180s, child200s, Linux phase210s. Existing F01_* lifetime diagnostic codes are retained as shared helper codes; G01 case ID, schema, environment variable and result paths are distinct. Shared session defaults remain100s/140s/5s. Cancellation stops waits, not necessarily non-cooperative underlying operations. Pending work blocks restoration; sealing prevents late writes. Whole process-tree termination and evidence after hard kill are not proven. New G01 paths have not been runtime-tested by earlier helper mock successes.

G01 artifact state policy is a separate data-only adaptation of the existing F01 policy, with G01 IDs/paths/schema/state keys and positive-tamper as predecessor. Setup failure requires setup/partial/terminal/Mocha/failure records; observation start makes journal/partial collection/state required; validation PASS makes saved validation+matching evidence hash required even if cleanup subsequently fails. Malformed/missing/conflicting records remain UNKNOWN and fail collection. The adaptation itself is NOT_RUN and is not covered by the original 29 F01 policy mocks.

## Linux orchestration

Append positive-fee after positive-tamper PASS. Call the new runner exactly once, stop on failure, never retry or update pins automatically. Refuse G01 start at or after elapsed19min; its210s phase finishes before22.5min, leaving90s inside the unchanged24min execution step. A timeout or exhausted preceding budget is a failure, not a skipped PASS. Keep workflow, compiler, build, Solidity, dependencies and all earlier phase definitions/test lists unchanged.

Artifact selection explicitly includes the G01 plan's file allowlist and all Linux-pinned sources. The independent G01 policy declares state-dependent required evidence; missing required files or record errors propagate as collection failure. The staged artifact excludes node_modules, symlinks, junctions, local evidence, preparation tools and arbitrary workspace files. Existing lstat/realpath/root checks remain. Concurrent hostile file replacement, hard cancellation and all-output-sinks failure are not solved here.

## Completion and limitations

Implementation/static review is complete only when source/plan pins, exact G01 title, 55-query fixed roster, ABI usage, timeout wiring, source import closure, candidate Diff and preservation hashes match. Runtime validation remains a separately authorized Linux execution: exact required/actual/unique G01, one PASS, no failure/pending/hook/reporter/cleanup/recording failures, exit0, matching artifact hashes and independent saved-data checks. Prior PASS is never reused for G01.

Executable amount=null; authority=false; consumptionLink=UNVERIFIED; rightsLink=UNVERIFIED. No dedicated consumption Receipt, terminal, complete history, residual right, RPC truth or economic authorization is created.
