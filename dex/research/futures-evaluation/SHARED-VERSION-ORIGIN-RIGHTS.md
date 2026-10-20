# Task2/82 evaluation origins and unsupported rights

Base main f09801b3e0c6a70f47fda7a857e1cc132a6e68c9 plus preserved task2/80 changes, in a separate uncommitted branch/copy. No contracts, original anchors, existing evidence, RPC, chain, deployment or trust registration change. No new rights ledger, refund execution, price/Funding/rounding rule or migration is implemented.

## Origin binding

The source loader now actually calls the existing evaluator through evaluateWithBoundOrigin and binds the evaluator's returned evaluationId, calculationVersion, full pinned source commitment and request commitment into each correspondence evaluation ID. The replacement relation also commits the pair of origins. Full diagnosis compares these fields with the privately registered local source; arbitrary caller IDs, implementation hashes and approval fields are not authorities. The evaluator's evaluationId already covers its complete source/request, including price selections and policy evidence.

A pinned implementation record describes ONE underlying calculator version and 22 static local .mjs import-closure file hashes plus the dependency lock file hash. Actual file bytes and declared version are compared. This is local identification/byte matching, not proof of code correctness, executable-memory identity, dependency installation integrity, OS isolation, independent reevaluation or chain authentication. External and dynamic code are not authenticated. Both TEST_ONLY_EVALUATION_A/B still use the same underlying implementation; different real calculator implementations have not been verified.

The original synthetic fixture and anchor are unchanged. A separate pinned test-only variation recipe loader registers cloned synthetic source contexts. One recipe selects a new synthetic report ID/round metadata with identical price values. Another changes a synthetic policy identifier without changing numeric economic parameters. The unchanged existing calculator validates and computes both. Same monetary amounts with different source evaluation IDs do not mean identical policy obligations: policy changes are not auto-linked. A registered price-evidence pair independently derives each catalog from its existing calculator result.

## Rights and key representation

Each output explicitly reports overpaymentRefundRight, fractionalResidualRight and refundConsumption with supported=false, evidenceState=UNVERIFIED, amount=null and distinct blockers. rightsTransitionComplete is always false; COLLECT/PAY local correspondence success is never whole-rights completion. These fields acknowledge missing linkage, not an invented zero balance or erased entitlement. REFUND remains explicitly rejected.

originalDetailedKey is the preserved existing offchain V2 key. key is a NEW diagnostic wrapper binding originalDetailedKey + token + policy/mode. Their bytes are not declared equal. Output keyRepresentation states ledgerMigrationImplemented=false and contractIdentifierMappingImplemented=false. No existing ledger key or contract identifier is migrated.

## Direct tests and limitations

New tests distinguish existing-calculator provenance execution from branded full correspondence tests. They cover equal-money/different-price and policy evidence IDs, full price-evidence correspondence, caller-origin tampering, account-only mismatch, physical-unit reuse across valid distinct groups, normal multiple items in one transaction, missing rights completion blockers and key metadata. The negative account/group cases keep row IDs, payload Receipt/Sequence and other attribution fields valid until the target guard.

Required regression is the prior selected265, including40 version-correspondence cases and the earlier selected225. A separate fixed manually reviewed15-title list and source hash joins the plan. Execution lists, JSON counts, process exit, source snapshots and failures remain local. These local pins cannot protect against jointly replacing a checker and its pins.

Fixed catalogs/terminals/future Q remain synthetic local rule fixtures, not actual reevaluation, independent calculation, chain finality or persistent-ledger proof. Actual candidates stay UNVERIFIED/NOT_EVALUATED, every execution amount null and every execution authority false. Common-calculation independence remains a blocker. QuickNode #24088 remains awaiting reply/payment on hold at last confirmation.

## Recorded execution

One integration execution: 280 PASS / 0 FAIL / 0 PENDING, exit0, comprising new15 and prior selected265 (including correspondence40 and earlier225). Fixed titles, actual report arrays, exit code and source snapshots/hashes were checked. No prior PASS was counted as this execution. Exact target reachability and actual candidate/price-pair outputs remain local. Both labels use the same22-file underlying calculator record; same-value price and policy evidence are synthetic and do not approve operational evidence.

## Task2/83 publication review

The calculator implementation record is a preparation-time fixed JSON record with a separately pinned expected hash. Runtime verification reads that record and compares current local bytes against it; it does not regenerate the expected record from the running files. This identifies a reviewed local file set only. The 22-file record and lock comparison do not authenticate Node.js or its built-ins, the operating system, installed ethers/transitive node_modules, dynamic imports/requires, or executable memory. The new correspondence/origin wrappers are outside the underlying calculator's static closure and are covered separately by the integration source snapshot. Fixture/manifest data use separate local pins; none is independent chain authentication. Lock byte equality does not verify the installed dependency tree.

Final review reused the existing single 280-test execution (280 passes, no failures/pending, exit 0). Its 57 implementation hashes, fixed titles and report entries were compared with the publication sources; all match. Only this explanatory documentation was added afterward, so executable changes did not require repeating that integration run. The existing Futures offline evaluation workflow already invokes the shared runner with group `new`: the updated fixed plan selects 134 cases, including the 40 correspondence and 15 origin/rights cases. No workflow or public RPC execution was added.

The verified scope is different evidence evaluations performed by the same existing calculator, not reevaluation by different calculator implementations. Original/new key distinction, separate COLLECT/PAY preservation, cross-group physical-unit reuse rejection and valid multiple items in one transaction retain their direct test coverage. Refund, fractional residual and overpayment-right linkage remain unsupported/UNVERIFIED; rightsTransitionComplete remains false. Actual candidates remain UNVERIFIED/NOT_EVALUATED, all execution amounts null and all execution authorities false. Fixed synthetic context/catalog/terminal/Q and common-calculation references do not prove persistent-ledger state, finality, independent calculation or operational approval.
