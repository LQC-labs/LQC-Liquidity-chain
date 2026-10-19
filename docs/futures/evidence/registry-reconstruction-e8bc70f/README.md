# Registry reconstruction record — tasks 2/66 and 2/67

This records a completed **single-contract reconstruction**, not recovery of the
original deployment Artifact. No existing Artifact, deployment lineage, Series,
Registry binding or trust anchor is replaced by these files.

| Judgment | Recorded result |
| --- | --- |
| Candidate reconstruction | **RECONSTRUCTED_RUNTIME_MATCH** |
| Original deployment Artifact | **REQUIRED_ARTIFACT_MISSING** |
| Artifact actually used by the wallet | **UNPROVEN** |
| Six subsequent local builds | **MISMATCH**, unchanged |
| Independent chain authentication / contract safety / V1 approval | **Not established** |

Candidate commit: `e8bc70ff5672e54503a161e36a36e5a9e6a0dac7`.
Source key: `contracts/futures/LQCFuturesMarketRegistry.sol`; no imports,
inheritance, immutable declarations or external libraries. The source is included
once, inside `compiler-input.json`, without line-ending or content changes.

The settings were extracted from that commit's `dex/scripts/compile.mjs`, not
inferred from current main: optimizer enabled / 200 runs, viaIR true, Shanghai,
and the original outputSelection. Exact compiler:
`0.8.30+commit.73712a01.Emscripten.clang`.

## Recorded comparison

Task 2/66 compiled the Registry once through the historical solc JavaScript API.
Its entire 2,130-byte runtime, including metadata, equaled task 2/63's stored code:

`0x133f59f02a8ae90873ceef749b582e4eabe2daad5e595326fd660ea0f7d2233e`

Zero differing bytes; no trimming, masking, immutable substitution or library
linking. Constructor arguments were not appended. This is not a comparison of
the wallet's original creation calldata, which remains unavailable.

Observation scope: BSC Testnet chain 97, Registry
`0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0`, Q=137741715,
Q hash `0x22711ba1e2ae25279883c0430e2101ad5577cbf715d45d235efaf29977d180b6`.
The observation remains **NODE_OBSERVED / UNAPPROVED**. Q is not an approved chain
anchor. `observed-runtime.hex` is only the exact public bytecode value extracted
from the preserved report, not the original RPC wire response or a chain proof.
No endpoint, credentials, transaction calldata or private filesystem paths are
included. Provenance lists the original report and journal SHA-256 hashes.

`provenance.json` is explicitly a new public summary, not a sanitized original
manifest presented as historical evidence. It identifies original source, lock,
build script, input, output, reconstruction script and manifest by hash. Full
original output, toolchain, local preservation records and duplicate files remain
in local evidence storage; they are intentionally omitted here.

## Exact toolchain and manual reproduction

Task 2/66 restored packages from existing npm cache tarballs, verifying the
historical lock's SHA-512 integrity and tarball SHA-256. Package identities and
all 16 compiler files actually loaded are recorded in `provenance.json`.
No install or package lifecycle script was run. Installed `tmp@0.2.7` was not
substituted for historical `tmp@0.0.33`: tmp/os-tmpdir belong to the unused CLI/SMT
path. They were not loaded by the historical compile.mjs API entry. This is not a
claim that the complete old npm-ci environment was reproduced.

Use the preserved exact toolchain, whose root contains `node_modules/solc` and
the other recorded packages. On another machine, obtain those exact npm tarballs
from an approved cache, verify both recorded hashes, then safely extract them to
the recorded locations without running install scripts. If required bytes are
missing or hashes differ, stop; do not substitute versions or automatically
download packages. Hashes identify files, not their safety or correctness.

From the repository root, Node.js 22:

```text
node --require ./dex/research/futures-evaluation/offline-guard.cjs ./docs/futures/evidence/registry-reconstruction-e8bc70f/reproduce.cjs <exact-toolchain-root> <new-output-directory>
```

The output directory must not exist. The portable adapter checks the public file
hashes, expected compiler version and loaded-module hashes, forbids external
package fallback, compiles only this input and compares every runtime byte.
It checks the complete compiler-output hash against the recorded 2/66 output.
The offline guard is supplementary, not an OS sandbox guarantee.

The portable adapter is a path-independent adaptation of the separately hashed
original 2/66 script. **Task 2/67 checked its syntax only; it did not recompile,
rerun tests or make RPC calls.** No CI workflow or compile/RPC hook is added.
NOT_EVALUATED, null confirmed amounts and all financial/execution authorities
remain disabled. Nothing here authorizes deployment, settlement or V1 acceptance.
