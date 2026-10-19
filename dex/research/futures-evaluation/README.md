# Offline Futures verification and diagnostic evaluation

From `dex`, with its existing locked dependencies installed:

    node research/futures-evaluation/run-tests.cjs

Uses existing ethers and mocha dependencies and Node 22. No additional package,
RPC, Anvil, compiler, wallet or service is required. package.json and lock are unchanged.
The runner checks syntax, a pinned list of 234 expected test identities, Mocha
JSON and exit status, and records fresh results under ignored .results.
Old PASS logs are not included or treated as fresh execution results.

## Trust and immutable evidence

Final implementation selected from tasks 2/41, 2/49 and 2/53. Legacy manifest
and candidate reference pins remain byte-identical. These local references were
fixed by the authorized reviewer, not the evidence submitter. They are not
operational trust, independent chain proof or economic policy approval.

The legacy manifest retains its historical Windows path as immutable data.
The loader reads only the bundled, original-hash-verified evidence; it never
resolves that historical path. All active dependencies use relative file URLs.
Fixture transport is the only change to legacy tests; assertions are retained.

Candidate files preserve original bytes, journal, Receipts, 19 role bindings and
hashes. Eighteen distinct historical compiler artifact records cover those roles.
They are not current-main build artifacts or deployment approval. Archived
collector source is included solely because the pinned manifest requires its
exact file hashes. These source files are hash-checked data, never imported or
executed by this runner. No original evidence is redacted and presented as intact.
Some historical source metadata refers to absent local paths; execution is not
needed. The adapter validates the historical evidence, not a live deployment.

## Calculation and authority limits

q18 is USD18 notional. PnL and collateral conversion retain exact reduced BigInt
fractions. No rounding, dust recipient, approved price freshness, Funding
attribution economics or Gap rate is defaulted.

Required Funding Epochs derive from positive validated held exposure. Whole totals
are null for incomplete evidence; submitted subtotals, evidence completeness and
allocation status are separate. COMPLETE never authorizes settlement.

Independent integration by parts rereads raw old/next quantities and timestamps.
It does not reuse primary delta, generated intervals or intermediate totals, but
shares input validation, integer parsing and source evidence.

Actual candidate remains NOT_EVALUATED; monetaryResult and confirmedAmount null;
fundsAuthority, settlementAuthorized, createsClaim and consumesHistory false.
Mock values cannot authorize claims or consumption. No contract, Registry,
settlement, token, Held, withdrawal or LP path is connected.

Each execution records calculation V2 and implementation SHA-256. Hashes identify
bytes, not correctness. Synthetic tests do not approve economic policies.
offline-guard is supplemental, not proof of an OS-level offline sandbox.

## Maintenance

Keep the expected test identities and file hashes synchronized only after review.
New results use a fresh directory and never overwrite earlier evidence. CI runs
only this explicit test list; no archival test or collector is discovered.

Module .gitattributes disables automatic newline conversion so fixture and test-plan byte hashes are stable across Windows and Linux.
