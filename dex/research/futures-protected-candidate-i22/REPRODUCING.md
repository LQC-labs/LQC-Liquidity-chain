# Offline reproduction

I-24 performed an independent package-only replay. No parent artifact/cache/node_modules/fixture was copied into the replay. Existing verified external tools are intentionally not bundled.

Required: Node22, verified Windows Foundry1.9.0 and Solidity0.8.30+commit.73712a01. The contract runner pins the previously verified Windows tool SHA256 and refuses other bytes. Cross-platform tool approval is NOT established.

From the candidate project root, using existing approved executable paths as arguments:

- node run-contract-i22.mjs old --forge <verified-local-forge> --solc <verified-local-solc>
- node run-contract-i22.mjs policy --forge <verified-local-forge> --solc <verified-local-solc>
- node run-ui-i22.mjs position
- node run-ui-i22.mjs market
- node run-ui-i22.mjs legacy
- node --test harness/public-gate.test.mjs
- node browser-i22.mjs <existing-approved-local-chrome>

Expected current bounded groups:544,19,58,44,6,7,10 respectively; never copy those counts without running. Contract544 excludes the three named long invariant suites and the separate I22RegistryUiTest group. The latter runs19 deterministic checks. Fuzzed regression tests use128 runs and seed0x21210001. No new long invariant action count is claimed.

foundry.toml pins version0.8.30, optimizer=true/runs1, viaIR, shanghai, bytecode_hash=none, offline, no auto detection, no FFI/external libs/filesystem permission. --use is mandatory and refers to a hash-verified existing compiler; offline execution does not download it. FOUNDRY_DIR/SVM_HOME and output/cache are isolated under .local-evidence/. No PATH/registry/WSL/user config changes are required.

The public historical ENGINE-POLICY-TRUTH.json retains its original evidence digest, successful historical count and exact mode table; absolute command/path fields were removed. It is not new EVM proof. The independent19-test run and unchanged Engine artifacts provide current package policy comparison.

Browser tests use a separately supplied local Chrome, fresh profile, loopback fixture, mocked IO and denied external page traffic. No ethers CDN, extension wallet, live RPC, signature or chain transaction is used. Runtime reports may contain machine paths and are local-only; .gitignore excludes generated results, profiles and caches.

Compare final source bytes, ABI/events/storage, all module runtime/initcode and immutable/code fingerprints before any release. Internal candidate flags are not an operational activation approval. Keep failed logs and do not change financial expectations to manufacture PASS.

## I28 policy packaging

The approved MIT grant and106-file package scope are in LICENSE and LICENSE-SCOPE.json. The69 Solidity/test bytes and existing execution commands remain unchanged. Do not treat historical I24 test counts as newly executed I28 results; independently replay the package with existing approved tools and record exits. No SDK installation or remote GitHub operation is authorized.
