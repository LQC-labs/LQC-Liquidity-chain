# BSC Testnet Registry node observation

Manual, read-only, single-Registry observation. Source expectations and runtime
helpers are reused from `scripts/verify-futures-deployment-lineage.mjs`; that
script's live/latest path is not executed by imports. No new dependency.

Run synthetic checks from dex: `node research/futures-node-observation/run-tests.cjs`.
CI runs this command only. It preloads the existing supplementary offline guard;
all HTTP responses in tests are synthetic. This is not an OS sandbox claim.
The pre-existing Master 7/7 chain97-readonly-evidence job is restricted to explicit
workflow_dispatch; PR/push events cannot automatically execute its live RPC path.

Manual collection requires an explicitly supplied `BSC_TESTNET_RPC_URL` and a
new output directory: `node research/futures-node-observation/collect.mjs <directory>`.
No RPC default or credential is written to the repository. Only the hostname and
setting source are recorded; never the endpoint path, query, credentials, or error
message. Redirects are refused. Limit: seven calls, 15 seconds per call including
body consumption, 512 KiB per response. No retries, fallback endpoint or latest.

Each run selects its own node-reported finalized Q. Code and owner calls use its
explicit number; the same header is fetched again and compared afterward. This
is node-reported consistency, not atomic snapshot proof, consensus verification,
or an approved chain anchor. The deployment Receipt is linked to its own earlier
block, not confused with Q. Prior task 2/62's Q is never used as an expectation.

Journal REQUEST precedes dispatch; RESPONSE/ERROR is appended and fsynced before
semantic checking or further dispatch. Raw code and owner ABI hex are retained.
Other responses use a safe field projection; arbitrary text/unknown fields are
omitted. A SHA-256 of the parsed response identifies the received JSON meaning,
not its original wire bytes or its truth. Provider error text/body is not retained.
Required failure preserves partial files and `collectionComplete=false`; an IO
failure may leave only the journal and a nonzero CLI exit. Existing directories
are never overwritten. Completed reports also retain implementation file hashes.

`NODE_OBSERVED` is always `UNAPPROVED`, never TRUSTED_NODE_OBSERVED or independent
authentication. Code presence and its Keccak hash do not establish deployment-code
identity: artifact comparison is explicitly NOT_PERFORMED. Owner, deployment
address/deployer/status and block comparisons use historical repository records,
not independently approved trust anchors. A later run may disagree with them.

Historical state, full logs, participants, transaction prices, V1 policy/Series
approval, actual cash and persistent consumption remain unverified. Existing Series
is not V1 input. NOT_EVALUATED, null money amounts and all execution authorities
false remain invariant. No transaction, signer, Oracle update or deployment path.
Raw live output belongs in ignored `.results/`; it is not an operational trust list
and is not required for synthetic CI.
