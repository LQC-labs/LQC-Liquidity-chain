# Stored exit verifier: portable local research build

Base main is `4ba13f2d60b8051a566deec25d3c109f3b85297e`. The financial
Solidity fixture files are untracked local research work, NOT contracts present
in that main. The verifier source is byte-identical to task 2/108. No financial
contract, Registry, money path or verifier behavior is changed.

## Build and test boundary

`build-requirements.json` fixes all 21 Solidity paths/byte hashes (19 unchanged
local fixture files, verifier, test mocks), compiler version/binary hash, settings,
empty library mapping, output selection and existing package/lock hashes.
`build-pins.cjs` contains explicitly reviewed literal hashes for those requirements
and the completed build manifest. Tests NEVER regenerate these expectations.

`build-common.cjs` checks installed selected dependency versions and soljson bytes,
the import closure, current sources, input source paths/contents, compiler identity,
optimizer/viaIR/EVM/libraries/output selection, input/output hashes and the reviewed
manifest pin. Both the runner and rejection tests use its `gate` function. The
runner cannot launch Mocha (and therefore Anvil) before the gate succeeds.

Artifacts are loaded solely from relative `build/compiler-output.json`. There is
no old compiler-output dependency or personal absolute source/artifact path.
Immutable offsets/names come from the new compiler AST; explicit fixture constructor
values reconstruct full expected runtime bytes before comparison to local code.
Observed runtime hashes are never adopted as expectations.

Commands from this directory:

```
node compile.cjs
node preflight-selfchecks.cjs
node run-tests.cjs
```

Compilation refuses an existing build directory. Use a new clean copy for a new
build; do not overwrite evidence. A changed source/settings/build requires explicit
review of new pins before testing. There is no automatic approval/update command.

The inherited package scripts are not the harness commands; use the commands
above. `package.json` and `package-lock.json` are unchanged copies associated with
the previously approved Router security lock (serialize-javascript 7.1.2), not a
claim that main's earlier 7.1.1 lock matches the installed dependency tree.

Selected lock versions: solc 0.8.30, ethers 6.17.0, Mocha 12.0.2, Anvil 1.7.1,
serialize-javascript 7.1.2. No versions were upgraded or packages installed here.
The solc build is 0.8.30+commit.73712a01.Emscripten.clang, optimizer 200, viaIR,
Shanghai, no external library links. The full original lock also fixes transitive
dependencies, but file hashes and selected version checks do not authenticate all
installed package bytes or prove compiler correctness.

For a separate authorized installation with a complete existing cache:

```
npm ci --offline --ignore-scripts --no-audit --no-fund --cache "<existing-cache>"
```

Missing cache/platform binary means BLOCKED, not permission for online fallback.
The recorded clean-directory run shares an existing installed node_modules via a
junction. It tests a clean source/artifact build, NOT a fresh dependency installation
or another OS. No old compiler input/output/artifact is copied into that clean build.

## Direct checks and remaining trust limits

The preflight checks modify disposable copies only: stale current source without
recompilation, mismatching input settings/content/path, output bytes, missing import,
library mapping, compiler declaration and unreviewed manifest. A shared launch stub
must remain at zero for all rejection cases; no Anvil is needed for these checks.
The normal gate check calls only a stub. This is not an OS-enforced offline sandbox
or protection against jointly replacing the checker and its reviewed pins.

The literal test plan contains 29 cases: existing Mock 22, two exact cap-256 boundary
checks, and five actual local-storage cases. The runner pins both the plan and test
source and rejects zero/missing/duplicate/unexpected execution lists. It records
JSON reporter output, exit code, source snapshots and original failure messages.

The cap=256 normal case uses a mutable test source with a two-row target position
and 127 other sequential two-row positions. It is a full account-log scan, not a
claim that all other positions are independently verified. The cap=256/count=257
case rejects before scanning. Any gas figure is tied to this exact Mock layout;
it is not a worst-case cost guarantee for 256 target records or all providers.

Actual tests use unchanged LocalFuturesCore/FundingV11/PartialV11/Attribution with
mock Oracles and an explicit local 0-rate fixture. Registry, TradingCore/preflight,
real Oracle/policy/Funding authentication, V1 Series approval and persistent-ledger
authentication remain outside scope. A stored Receipt match is a format/source
consistency check, not proof of an external transaction.

The verifier remains local chain 31337, view-only, NOT_EVALUATED with no financial
amount fields, explicit authentication blockers and all execution flags false.
No consumption, claim, payment, Held use, return or LP recovery is enabled.

## Proposed publication scope

`fixture-inclusion-candidates.csv` lists each fixture path, original local source,
SHA-256, why its original import closure is needed, importing files and the explicit
status REVIEW_CANDIDATE_NOT_APPROVED_FOR_GIT. These 19 files are not selected for Git
as a group. The source provenance and import closure need review before PR inclusion.
No node_modules, temporary mutation directories, private logs or operational trust
anchors should be included. Old task 2/108 sources, artifacts and failure evidence
remain untouched. Results for task 2/110 are recorded separately.

## Recorded task 2/110 results

Two independently started source builds (same installed compiler/dependencies)
produced byte-identical input, output and manifest:

* input SHA-256: fac3394440d9003c5df894415a24229cacfb773ef03aa5f6c3c185c88f24b6fa
* output SHA-256: bd81eee2684a004b13ba56465cb720024a0d678f90ec402d41c5b0e7b33d5636
* reviewed manifest SHA-256: 9f4ff58f9d313697842ec722c3999b118e0c8168b1f8d1d98c1fa115f3a1fc9d

The clean directory had no build or old artifacts before compilation. Its single
combined run passed 29/29 (24 Mock +5 actual local storage), zero pending/failures,
exit 0. This is separate from all task 2/108 executions. The nine negative build
checks and normal gate stub check passed separately with zero Anvil starts.

The cap=256 layout above estimated 5089162 gas; the three-row actual-storage view
estimated 333159 gas. These are measured estimates for those exact layouts, not a
worst-case ceiling. There is no larger target-position or provider-wide guarantee.

An initial dependency preparation check rejected the main-based 7.1.1 lock against
the shared 7.1.2 installation before any compile/Anvil. Its evidence is preserved;
the already-approved Router 7.1.2 lock was then copied unchanged. No package was
installed and no original lock was edited.
