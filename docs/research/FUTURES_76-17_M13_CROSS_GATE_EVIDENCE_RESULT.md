# 76-17-⑥-⑤ / M13 — M10/M11/M12 cross-gate evidence reconciliation

**Status: OFFLINE CROSS-GATE VERIFIER PASS / REAL CANDIDATE EVIDENCE BLOCKED / NO DEPLOYMENT OR MIGRATION AUTHORIZED**

## Implemented

- Cross-gate reconciler: `scripts/reconcile-futures-m13-evidence.mjs`
- Seven focused regression cases: `test/futures-m13-cross-gate-evidence.test.mjs`
- Honest unassigned candidate evidence bundle: `test/fixtures/futures-m13-unassigned-evidence-bundle.json`
- GitHub Actions SUCCESS: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45047993622
- Successful candidate code commit: `649c4ec10f892fd16ec0adf7055f7c66be76eb9e`
- Evidence artifact: `futures-m13-cross-gate-verdict`, artifact ID `14764268131`

## Concrete M13 crosschecks

M13 consumes existing M10 candidate manifest, M11 pinned block verdict and M12 Oracle/governance evidence as separate inputs. It does not collect new on-chain data on an absent candidate.

1. **Identity consistency:** same chainId 97, and same assigned Registry, Vault, Engine, Oracle and collateral addresses across M10 and M12. A disagreement is FAIL; missing unassigned candidates are BLOCKED.
2. **Bytecode consistency:** compare Oracle runtime code hash in M10 versus M12, and M11 runtime hashes against M10 expected values. Contradictions are FAIL.
3. **Pinned block:** only accept an M11 RPC-observed block if number/hash match the M10 frozen candidate anchor. Otherwise FAIL.
4. **Role consistency:** cross-check reported Registry/Vault/Oracle owners and Guardian against M10 and M12. Contradictions are FAIL.
5. **Report integrity:** reject an M11 verdict claiming PASS, granting deployment or asset transfer, or claiming on-chain results despite `rpcQueried=false`.
6. **Coverage:** require M11 check names for runtime code, Engine/Vault/Registry connections, owners, Guardian and market Oracle/collateral, without duplicate check IDs.
7. **Provenance:** require distinct M10, M11 and M12 origin references. Provided references are not independently authenticated by an offline checker and cannot create authority.

All seven negative/positive **synthetic regression scenarios passed** in CI. The current bundle uses historical facts from previously completed M08–M12 work but leaves the new deployment candidate deliberately UNASSIGNED. Its intended result is BLOCKED.

## Current blockers and non-goals

- No independently pinned deployed **new** Registry, Vault, Engine, Oracle/feed and collateral token candidate.
- No candidate RPC-observed on-chain snapshot with independent block hash and bytecode attestation.
- No verified feed/proxy implementation and license provenance, price freshness, or independent audit.
- No independently verified Safe signer set, governance handover, explicit test-only deployment permission, or activation approval.
- Historical Vault's known 5000 mUSDT available balance remains a legacy user right and is not imported into a new Vault.

**M13 never signs, submits a transaction, executes `setEngine`, transfers tokens, deploys, activates a market or merges PR #460.**

## Recommended next engineering gate

M14 should be an **independent evidence acquisition plan**, not another blanket "PASS" based on generated manifests. For an already-existing and separately authorized candidate, collect timestamped, block-pinned read-only responses from two independent RPC sources and explicitly verify bytecode hashes, Oracle feed implementation, Safe owners/threshold, emergency/epoch state, and user-rights isolation. Until real addresses are supplied, leave M14 NOT_RUN.
