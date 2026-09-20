# Master 2/15 — LQC Flow Runtime Mismatch Lineage Classification

Status: **2/7 lineage classification**

## Inputs reviewed

- Current `dex/package.json`: Solidity compiler is pinned to `solc 0.8.30`.
- Current `dex/scripts/compile.mjs`: optimizer enabled, 200 runs, `viaIR: true`, EVM `shanghai`.
- Original LQC Flow Core introduction commit: `39adfcf53812dc394c3bdfb8b37d7330cfa448c1`.
- The original compile script used the same optimizer/viaIR/EVM settings and the original package also pinned `solc 0.8.30`.
- Git lineage previously established that Factory/Pair/Router Core source files have no later source commit.
- 2/5 read-only observation established live Router/Adapter/Factory/Pair bindings but different runtime hashes for all four current-vs-deployed contracts.

## Classification

### Factory / Pair / Router

The mismatch is **not explained by the current compiler version or compile settings versus the original repository introduction**, because those reviewed settings are materially the same.

The repository still lacks cryptographic evidence tying the live deployments to artifacts generated from the reviewed introduction commit. Therefore the correct classification is:

**DEPLOYMENT / ARTIFACT LINEAGE UNPROVEN**

This does not establish a functional defect. It means the deployed bytecode cannot receive artifact-identical credit from the currently available repository evidence.

### Adapter

The Adapter was introduced later than the Flow Core and has separate deployment lineage. Its successful historical Router2→Flow execution remains operational evidence, but its current-vs-deployed runtime mismatch is likewise:

**DEPLOYMENT / ARTIFACT LINEAGE UNPROVEN**

until its exact deployment artifact/compiler input can be recovered.

## Release consequence

- Preserve historical Testnet operational evidence.
- Do not label the current main artifacts as byte-for-byte identical to the existing BSC Testnet deployments.
- Do not redeploy solely to make hashes match.
- Do not rewrite Flow Core solely because hashes differ.
- A future release candidate that needs artifact-identical Testnet credit must use a reproducible, pinned build/deployment evidence chain.

## Isolation rule

This investigation does not authorize changes to Futures production code or Futures Testnet state. DEX Flow and Futures remain independently testable execution/accounting domains with reviewed shared interfaces only.

## 2/7 decision

No functional/security incompatibility has been demonstrated. The mismatch is classified as an **evidence lineage gap**, not a proven Core implementation failure.

## Next

**2/8 — Reproducible build/deployment evidence gate.**

Define the minimum reproducibility seal for any future selective Flow deployment: source commit, compiler version, full compiler settings, creation/runtime bytecode hashes, constructor arguments, deployer/governance identity, network/chainId, transaction hash, block number and resulting contract addresses. This gate must be prepared without performing a deployment.
