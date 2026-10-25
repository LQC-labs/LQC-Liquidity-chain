# G01 saved positive-fee evidence tamper checks

IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. No target module, verifier, mutation case, test, provider, Anvil, compiler or CI was executed during preparation.

One original control S01 and five negative checks S02-S06 use the unchanged verifyPositiveFee and hash-fixed ABI. They consume only results/positive-fee/positive-fee.json after the same run's G01 runner and terminal records confirm exactly one successful G01 with completed cleanup. The public runner accepts no CLI input or historical fallback. No extra deployment, transaction, RPC or Anvil call is added. Earlier PASS results are not results for this new suite.

| ID | Declared change | Required rejection |
|---|---|---|
| S01 | Original bytes unchanged | Original verifier success |
| S02 | Delete before Domain query plus its 2 semantic and 2 raw events; keep snapshot | QUERY_REQUIRED_LABELS:before, line124 |
| S03 | feeBps 1→2 in before+after snapshots/semantic values/canonical raw replies | G01_POLICY_FEE_BPS, line167; actual2, expected1 |
| S04 | Same changed policyDigest in before+after snapshots/semantic values/canonical raw replies | G01_POLICY_DIGEST, line167 |
| S05 | After pool.fees +1 in snapshot/semantic value/canonical raw reply; delta300→301 | G01_FEE_BUCKET_INCREASE, line174; actual301, expected300 |
| S06 | feeTarget 300→0 in both saved integer tuples/semantic values/canonical raw replies | strictEqual at line171; actual0, expected300 |

Each case starts from an independent parsed typed graph; BigInt records and graph references remain typed. Fixed ABI names resolve Config and integer tuple indexes. Before each coherent rewrite, the original raw response is checked against the original stored value's ABI encoding. Mutate exactly the declared leaves, reencode canonical output and independently replay declared operations against the original graph. S02 has2 declared operations, S03/S04/S06 each6, S05 has3. Preparation errors, dangling references and decode errors are outside the verifier rejection catch and cannot become expected negative PASS.

Negative results require AssertionError/ERR_ASSERTION, the fixed verifier source line, exact named first-line message or operator, and applicable numeric actual/expected operands. An earlier raw/value mismatch or any different assertion fails the test. Original bytes and fixed ABI are hashed throughout and reverified after all cases. Preserve changed paths, old/new values, input/mutated hashes, individual result/error records and final replay/integrity status. Independent replay checks declared edits; it is not RPC truth authentication.

Linux adds fee-tamper only after positive-fee PASS. Child limit45s, phase60s; one call, no retry/pin regeneration. G01 starts before elapsed19min and has a210s phase; the following60s stage ends before23.5min within the unchanged24min execution step. All earlier phase definitions and workflow remain unchanged. Failure stops subsequent execution, but existing collection preserves partial evidence. The collector explicitly selects7 common files,6 case files and5 mutation files; applicable evidence is required. Missing/duplicate cases, result disagreement, write failures or nonzero termination propagate failure. Source snapshots use explicit Linux pins and existing lstat/realpath/root checks; no dependency links, workspace/secret dumps or local preparation evidence are uploaded.

Scope: the new plan/pin, stored-data child, one-shot runner, this document and three Linux orchestration/plan/pin files. Existing G01 economics, its55-query verifier, F01 verifier, 17/6/8/29/12/9/14/G01 lists, Solidity, fixed builds/gates, helpers, dependencies and workflow are unchanged.

Static verification includes exact6 IDs/titles/5 rejection locations, inert plan/source hashes, transitive relative import closure, original graph representation and removable-reference analysis, phase/collector wiring, candidate Diff and preservation. Syntax parsing does not run cases. Actual assertion reachability, Promise/timeout/failure paths and artifact propagation remain NOT_RUN. Whole process-tree termination, concurrent hostile file replacement and evidence after hard cancellation are not proven.

Executable amounts remain null, authorities false, consumption/rights links UNVERIFIED. No general openPosition opening-fee coverage, RPC-truth guarantee, complete consumption ledger, dedicated consumption Receipt/terminal or residual right is created.
