# 76-17-⑥-⑤ / M10 — Offline predeployment isolation gate

**Status: VERIFIER TEST PASS / CANDIDATE BLOCKED / DEPLOYMENT NOT AUTHORIZED**

## Scope and source

- Research branch only, no production or historical-chain transaction.
- Validator: `scripts/verify-futures-m10-manifest.mjs` (offline, without RPC or wallets)
- Candidate fixture: `test/fixtures/futures-m10-undesignated-candidate.json`
- Negative tests: `test/futures-m10-manifest.test.mjs`
- GitHub Actions: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45046671357 — SUCCESS.
- Workflow output: `futures-m10-offline-verdict` artifact, ID `14763676723`.

## Known historical read-only baseline (BSC Testnet chain 97)

- Registry `0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0`
- Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`
- Engine `0xe4f1320c8709631776c7e39e0916584935882525`
- Historical mock Oracle `0xbf6a446c5e17228e70e45645ab47f751bdfc4b41`
- Pinned M08 snapshot block `144115366`; known user available balance **5000000000000000000000 base units** (5,000 mUSDT). These are historical observations, not immutable guarantees of today's state.

## Candidate / wiring controls

The manifest checks five separately recorded addresses: new `registry`, `vault`, `engine`, `oracle`, and `collateralToken`. Addresses cannot be zero, repeated, or alias any historical core contract. Missing addresses are explicitly marked `UNASSIGNED` and block readiness rather than defaulting to the old stack.

Cross-component readbacks to be independently attested: `Vault.engine == new Engine`, `Engine.registry == new Registry`, `Engine.vault == new Vault`, `Market.oracle == approved Oracle`. Unknown values remain `UNVERIFIED`. Wrong wiring is a hard FAIL.

Safe-new-stack declaration forbids reuse of historical Vault, historical `setEngine` calls, implicit historical asset transfers and copying old user positions.

Governance and oracle gates require independent evaluation of: real Oracle/feed provenance and freshness, config hash/version, recovery epoch binding, owner/guardian roles, multisig approval, independent security review, deployment approval and comprehensive historical-account discovery. An offline JSON declaration **cannot** authenticate these claims, so verdict is always at most **BLOCKED**.

## Current verdict

- **Checker syntax and negative tests:** PASS in CI.
- **Known baseline manifest structurally accepted:** expected BLOCKED.
- **New candidate addresses:** UNASSIGNED, not guessed.
- **Runtime hashes and Oracle provenance:** missing; require actual chain-specific code deployment evidence before any real use.
- **Real deployment / transfers:** NOT_RUN / BLOCKED.
- **Existing Vault's 5000 mUSDT known user right:** preserve in the existing contract; no automatic migration.
- **Historical MVP retirement:** BLOCKED pending independent user-rights and inventory approval.
- **PR #460:** unrelated Draft; no merge or modification.

## Next engineering gate M11 (not started)

Once new chain, addresses, proposed runtime hashes, validated Oracle/feed provenance, governance signers and an independent security review are actually available, cross-check manifest against a trusted on-chain read-only snapshot at one canonical block. Obtain explicit approval **before** any deployment, configuration transaction, user balance movement, or market activation.
