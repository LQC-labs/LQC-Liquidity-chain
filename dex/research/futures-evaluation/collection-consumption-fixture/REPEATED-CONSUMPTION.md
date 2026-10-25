# Two cumulative collection executions (R01)

IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. Base: bffffa8abb81d64232d5963061cd39f665245882.

Use a separate local chain-31337 fixture with the unchanged G01 research-linked
deployment, two accounts, feeBps=1 and POSITIVE_FEE_TWO_ACCOUNTS policy. Do not
call the G01 full-budget specification helper. No Solidity, build, dependencies,
workflow, existing tests or economic authorities are changed.

Both positions open at origin+10 and close completely at origin+50, with
exposure sequences 1 then 2. The unchanged prerequisites require two completed
checkpoints/members and Attributions, materialized integrals, and Epoch state3.
LONG Funding claim20 remains unspent; no LONG plan/payment/withdrawal is added.

Independent allocation: total PnL/Funding debt600020; first budget300010 gives
300010*600000/600020=300000 and 300010*20/600020=10, with no reserve or remainder.
Fee allocation begins after PnL/Funding debt is fully allocated.

| Field | Execution1 cumulative | Execution2 cumulative | Execution2 delta |
| --- | ---: | ---: | ---: |
| Budget/linkedConsumed | 300010 | 600320 | 300310 |
| PnL | 300000 | 600000 | 300000 |
| Funding | 10 | 20 | 10 |
| fee | 0 | 300 | 300 |
| Collected.amount | 10 | 10 (event delta) | not a cumulative consumption field |

One sealed plan; budget calculation step1/2, integer specification sequence1/2
and actual execution sequence1/2 are checked separately. Coordinator
expectedActualExecutionSequence remains0 and actualReceiptConfirmed remainsfalse;
neither is promoted into a receipt API. modeledAccountFunding advances0->10->20.
The second integer call supplies expectedAccountTarget10. Two distinct execute
transactions consume distinct specifications. No quote/storage/bytecode injection,
impersonation, permission relaxation or retry is used.

Every step uses a separate NormalEvidenceSession with one send permitted. Step1
must actually settle and restore its RPC guard before any second specification
or session can start. The unchanged FundingLifetime120s budget covers setup and
both steps together; it is not reset. Session defaults100s/140s/5s are unchanged.
Partial setup hashes, requests, values, errors and both in-progress records are
retained before cleanup; a late or non-cooperative task remains poisoned.

Each step saves block-fixed raw queries, runtime/immutable/code, balance/allowance
roles, the transaction/ordinary EVM Receipt/block/logs and a typed record. The
fixed verifier constructs55 queries per side for step1 and57 for step2 (both
specifications). It requires exact labels, role/getter/args/calldata/block tags,
canonical responses and saved values, and enforces each before/after delta.
The offline combined verifier accepts only two saved byte strings and fixed ABI
bytes, checks scope/keys, unchanged accounting between consumes, the intervening
budget/integer transactions and contiguous parent hashes, then checks final sums.

The runner requires exactly one R01 test, no pending/duplicates/hooks/reporting
failures and exit0. Its artifact classifier is shared with the Linux collector:
each started step requires partial/start/journal/state records; successful step
validation remains required even after a later failure or cleanup error. Overall
failure requires case-failure; malformed/missing/conflicting evidence is UNKNOWN
and collection FAIL, never proof of NOT_RUN. Required files are selected explicitly
through the unchanged link/path guards. New artifact-policy branches are NOT_RUN.

Append one210s Linux phase after fee-tamper PASS. Start R01 before elapsed20min;
otherwise stop without running it. This leaves30s within the unchanged24min
execution step under the phase bound, but does not guarantee earlier phases leave
enough time. No workflow or job timeout change. Child200s and Mocha180s retained.
No local execution, compile, installation, module evaluation, CI or publication
was performed for this implementation. Previous PASS is not this revision's PASS.

This checks two local research executions only: no complete history, dedicated
consumption Receipt/terminal, RPC truth, general openPosition risk/fee coverage,
transport cancellation or whole-process-tree termination certification. All
executable amounts remain null, authorities false, consumption/rights UNVERIFIED.
