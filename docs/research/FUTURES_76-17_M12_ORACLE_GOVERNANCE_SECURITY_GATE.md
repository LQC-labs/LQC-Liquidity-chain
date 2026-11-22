# 76-17-⑥-⑤ / M12 — Oracle / Safe / recovery independent evidence gate

**Status: OFFLINE GATE TESTS 6/6 PASS / CANDIDATE SECURITY BLOCKED / NO OPERATIONAL AUTHORIZATION**

## Evidence and boundaries

- Scoped source: `scripts/verify-futures-m12-security-evidence.mjs`
- Focused scenarios: `test/futures-m12-security-evidence.test.mjs`
- Deliberately incomplete security fixture: `test/fixtures/futures-m12-security-unassigned.json`
- Successful GitHub run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45047382516 (SUCCESS; offline verifier)
- Tested gate commit: `fc843b21dec728ad326213e62d67948e64521b72`
- All six regression scenarios pass. An initial failed run incorrectly categorized null Safe threshold as FAIL; corrected to BLOCKED. Invalid nonzero Safe threshold or threshold > member count still FAIL.

## Source-grounded controls

The current research branch `LQCFuturesMarketRegistry` has `activateMarket(marketId, expectedEpoch)` with explicit recovery epoch, a REDUCE_ONLY requirement, approved Oracle and unexpired approval lease. Legacy ACTIVE attempts through `setMarketMode` / `setMarketActive` reach `_setMode`, which rejects a change into ACTIVE. Only the owner may approve/activate recovery. Guardian may tighten emergency mode, not reactivate. `RECOVERY_MAX_ORACLE_AGE = 120` seconds.

The Registry checks Oracle runtime codehash, market-index-token-scoped Oracle configuration, optional Aggregator configuration version/hash and fresh quote. That is **not equivalent** to verifying actual underlying feed implementation/proxy provenance or custody by an approved organization.

The `LQCAggregatorOracleAdapter` feed path reads aggregator price and timestamp, rejects stale/invalid rounds, bounds deviation when the reference feed is enabled, and uses a two-step owner transfer. `Vault.setEngine` is owner-only but has no state migration gate; historical Vault reuse is expressly forbidden by M09–M11.

## M12 gate fields

1. New Registry/Vault/Engine/Oracle/feed/collateral addresses, all distinct and not aliases of the historical core.
2. Historical Vault untouched: no `setEngine`, no copying old ledger, no implicit collateral transfer.
3. Oracle feed runtime and underlying implementation code hashes; configuration hash/version; heartbeat and quote age (120 second recovery boundary).
4. Independent feed/proxy provenance, price decimal/normalization, reference-feed deviation and circuit-breaker acceptance.
5. Explicit recovery market ID, epoch, bounded expiry, stale-calldata rejection and guardian emergency restrictions.
6. Owners, Guardian, separate Safe membership/threshold and two-step ownership acceptance; actual on-chain Safe custody requires independent proof.
7. Reviewed source commit, independent security review, epoch replay regression, legacy withdrawal-rights preservation, Oracle integration license provenance and separate deployment approval.

The checker is **offline** and consumes supplied JSON. Even a fully asserted input remains **BLOCKED**, since offline assertions do not authenticate the claims or grant governance approval. Absent proof stays BLOCKED; malformed or contradicted security claims are FAIL.

## Current blockers

- New contract, feed, Guardian and Safe addresses still **UNASSIGNED**.
- No independent feed implementation, proxy provenance, runtime hash or price freshness attestation.
- No demonstrated Safe signers, threshold, ownership acceptance, independent audit or approval for deployment.
- Historical user's 5000 mUSDT rights remain in the old Vault; this test does not authorize moving them.
- PR #460 independent security review still pending.

**Next suggested M13 (not started):** independent evidence collection template for already deployed candidate; only collect read-only on-chain proof if a candidate exists. Never fabricate or choose addresses, request private keys, sign, deploy, move assets, or merge.
