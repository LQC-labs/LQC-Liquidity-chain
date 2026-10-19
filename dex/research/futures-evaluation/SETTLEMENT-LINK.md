# Read-only settlement link diagnosis V2

## Scope and provenance

Local base main: 35f8cdfede466aa87b21856707e9b583f11b6e72. Task 2/71 and its logs are preserved in their original work copy. This copy changes no financial contract, Registry, anchor, historical record, or Router file. No network, chain or cash action is performed.

The public loader calls the unchanged PR403/405 pinned candidate verification. A privately branded, deeply frozen context binds its output and reread semantic commitment. Caller success flags, copied contexts, substituted prior outputs, mismatching commitments and existing-Series/V1 mixing are rejected. A context describes its recorded Q only; it is not a live-state certificate. Local test pins are not operational approval or independent chain authentication.

## Identity

Position aggregate keys bind chain ID, canonical role/address/Runtime Hash set, Domain, Series, account, position and obligation kind. Query Q and calculation version are excluded. Contract upgrades and Series migration are unsupported, not a reason to reset consumption.

Detailed keys currently support Funding only: aggregate key + OFFICIAL/GAP + Epoch (null for Gap) + exact [from,to) attribution interval. Intervals derive from the existing validated complete transition history and official Epoch configuration through integrateHistory; caller-submitted intervals must match that derived catalog exactly. OI-change and Epoch/E boundaries remain separate. Unsupported phases/kinds, mixed positions, incomplete histories, invalid intervals and absent catalog entries are rejected. PnL/fees have aggregate identifiers only; detailed PnL/fees, open-ended positions, independent policy authentication and an execution ledger are not implemented.

Evaluation ID binds source semantic commitment, computation version, selected aggregate/detail key and comparison inputs. Version changes produce another evaluation ID, never a fresh economic obligation or reset authoritative consumption.

## Consumption evidence levels

Results separate internalConsistency, historyCompleteness and originalLedgerComparison. Submitted limits/subtotals and diagnostic remainder are explicitly caller-data arithmetic. authoritativeLimit and authoritativeRemaining stay null, including a full local reference match.

No submission: MISSING, unknown subtotal and unknown recorded consumption. Empty submission: internally consistent declared subtotal zero but UNVERIFIED completeness, unknown recorded consumption. Nonempty self-consistent submission without an independent terminal: PARTIAL, not whole-history completion. Truncated prefixes remain PARTIAL. Sequence starts at one; all receipts must be nonzero, unique, ordered and cumulative amounts must match; the declared terminal is checked against the submitted rows. No trusted terminal is inferred from that declaration.

The pure comparison helper supports a separately provided local reference for unit verification: exact entries and terminal Sequence/Receipt/cumulative may yield COMPLETE_AT_LOCAL_REFERENCE, including an evidenced local zero. Such references are not independently authenticated or current. The full candidate diagnosis intentionally has no reference injection API: archived evidence has no supported terminal consumer ledger. Supplying reference/authentication fields is rejected. Original journal consumption/limit certification remains UNVERIFIED.

Archived linkedConsumed is an all-component observation only. It is neither a Funding consumption proof nor a Funding limit. Old Q observations are exposed as LOCAL_RECORDED_ONLY_NOT_CURRENT_OR_INDEPENDENT. No comparison is promoted to current unspent funds, payment approval or a financial claim.

## Mock and authority

The comparison helper validates full single-position closure history and exact stored price coverage before comparing values. Empty/incomplete/mixed-position/unsupported direction inputs are rejected. STORED_VALUES_MATCH_ONLY is not full Coordinator compatibility, authenticated policy/Oracle approval, freshness approval, or settlement eligibility.

Every diagnostic result remains NOT_EVALUATED, confirmedAmount/returnAmount/monetaryResult null, activationAllowed/settlementComplete false and all execution authority flags false. Errors throw without an approval result. Funding, prices, shared obligations, current unresolved state, Held, LP and consumption blockers stay separate.

## Tests and limitations

The manually enumerated settlement-link-test-plan.json has a fixed SHA-256 embedded in settlement-link-test-plan.cjs, and pins every test source. It does not derive expected identities from test source. Plan/file validation precedes Mocha. JSON reporter lists, partitions, counts and exit code are matched exactly; 0/deleted/missing/duplicate/unexpected execution is rejected. Changing both checker and plan together is outside this local protection. Hashes identify reviewed bytes, not correctness.

Default run: node dex/research/futures-evaluation/run-settlement-link-tests.cjs [new-output-directory] [all|regression|new]. Each output directory must be new.

Regression scope: unchanged 2/71 input/history/adapter/calculator/funding completeness suites (234 tests) plus PR405 recorded-V1-evidence suite (9), total 243. No V1 calculator algorithm changed; V1 compatibility rejection is additionally covered in the new diagnosis suite. Existing V1 economic calculator tests and chain scenarios are not repeated. New cases distinguish pure synthetic-reference helpers from actual pinned-candidate full diagnosis. Synthetic zero-reference proof is not actual ledger authentication.

The context preparation retains a 30-second local diagnostic suite budget. Existing regression timeouts/assertions are unchanged. Offline guard is auxiliary JavaScript defense, not an OS sandbox. Dependencies reuse an existing local node_modules junction without installation. Results retain exact plans, file hashes, JSON, stdout/stderr, exit codes and failures; separate runs must not be combined as one run.

QuickNode #24088 remains awaiting reply. No commit, push or PR is part of this task.

## PR integration review (task 2/74)

The complete main diff includes this module, its tests, runner, fixed-plan verifier/JSON, runner unit tests, this document, and the offline workflow step. No historical logs, user paths, new chain evidence or local dependency junction is published.

Task 2/73 first run: 304 passes (243 existing regression + 48 link + 13 runner), zero failures/pending, exit 0, 143.063 seconds. After explicit unsupported-direction validation and its direct test were added, affected new tests ran separately: 61 passes, zero failures/pending, exit 0, 11.048 seconds. The final complete source did NOT run as a single 304-test execution.

The initial-to-final hash differences are exactly: lib/settlement-link-diagnosis.mjs, settlement-link-test-plan.cjs, test/settlement-link-diagnosis.test.mjs, settlement-link-test-plan.json. All other 35 recorded dependency/test hashes match (checked against current bytes, including regression files not listed by the new-only final run). The six existing regression test files and their unchanged calculation/adapter/input modules do not import the new link module or fixed runner plan. Therefore the 243 existing results remain applicable; the changed module/checker/test/plan path is covered by the final 61. No additional economic or chain regression is inferred.

CI retains the existing offline input suite and existing separate V1 research workflow. A new step runs the fixed-plan runner's new group (48 link + 13 runner), using a fresh output directory and the auxiliary offline guard. No live RPC job is added or made automatic.

Resolved review boundaries: interval identity explicitly includes OFFICIAL/GAP, Epoch and validated [from,to); aggregate/detail identities exclude Q and calculator version; partial prefixes do not complete a ledger; local-reference match is unauthenticated; submitted arithmetic cannot set authoritative limits. All result authority flags remain false and confirmed/return amounts null. Synthetic helper references are not full-path original ledger authentication. Runtime migration, detail PnL/fees, actual terminal ledger proof, independent chain/price approval and V1 Series acceptance remain out of scope.

Local validation of the exact new CI command (dex working directory): 61 passes, 0 failures, 0 pending, exit 0, 10545 ms. YAML parsed and the step/default working directory checked. This is a separate affected-test execution, not a final 304-test claim.
