# 76-17-⑥-⑤ / M11 — Candidate pinned-chain snapshot inspection

**Status: FOCUSED VERIFIER TESTS PASS / CANDIDATE BLOCKED / NO LIVE CANDIDATE RPC QUERY**

## Implementation and check

- New read-only checker: `dex/scripts/verify-futures-m11-chain-snapshot.mjs`.
- Isolated tests: `dex/test/futures-m11-chain-snapshot.test.mjs`; six scenarios PASS (unknown candidate = zero RPC, valid mocked pinned wiring, historical Vault substitution rejection, wrong chain/hash rejection, code/hash mismatch, wiring/Oracle mismatch).
- Passed GitHub workflow: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45047066455
- Tested code commit `5b9fd4b9e7efc8a7e5bb4ab1e94e289db3b3ae83`.
- Artifact `futures-m11-readonly-verdict`, ID `14763508908`.
- Initial isolated CI attempts failed on a test-mock bug (mixed-type address lookup, then malformed synthetic address), not on candidate contracts; both fixed before the successful focused run.

## Mechanism

The existing M10 manifest is validated for chainId 97, five complete candidate addresses (new Registry, Vault, Engine, Oracle and collateral token), and explicit no-legacy-migration flags.

**No candidate address or anchored block supplied ⇒ BLOCKED without creating an RPC client or contacting a network.** The current fixture intentionally leaves addresses `UNASSIGNED`; no addresses are invented.

Only after a separately approved test-only candidate already exists and complete addresses, a canonical block number/hash, expected owners, guardian, market ID, expected bytecode hashes, and a read-only RPC endpoint are specified may M11 inspect chain state at a pinned block.

The checker then verifies:
1. ChainId 97 and exact block hash.
2. Deployed runtime code nonempty and keccak256 code hashes for the four core contracts.
3. On-chain `Vault.engine`, `Engine.registry`, `Engine.vault` readbacks, compared with the manifest.
4. Registry, Vault, Oracle `owner()`, Registry `guardian()` against known authorized addresses.
5. Registry market collateral and Oracle addresses against the intended candidate.
6. No candidate core address equal to historical Engine/Vault/Registry/mock Oracle.

**Limits:** Actual feed/proxy implementation trust, Oracle freshness, live market recovery epoch, Safe multisig custody, security audit, and approved deployment remain independent open checks. A hash match does not prove safe Oracle semantics, and isolated mock provider tests cannot prove a real contract.

For the current branch the result **must remain BLOCKED**, not PASS, and no deployment, market activation, `setEngine`, historical user balance movement, PR #460 change or main merge is authorized.

## Next

M12 should prepare an independent security checklist for Oracle/feed/proxy provenance, epoch binding, Safe ownership and emergency controls. It must not solicit signatures, private keys, token transfers, or initiate production deployment.
