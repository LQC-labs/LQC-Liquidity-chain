# Master 2/15 — LQC Flow Gap Classification

Status: **2/4 gap classification**

## Evidence basis

- 2/1 pinned current Core and historical Testnet evidence.
- 2/2 focused CI compiled current Solidity and passed Flow regression/security/native/Router2-Flow tests.
- 2/3 found no later source-history drift for Factory/Pair/Router and reconciled the pinned Testnet Router with successful Router2→Flow execution evidence.

## A. Implementation gaps

### A1 — No confirmed Core correctness failure
Current focused CI provides no evidence of a Factory/Pair/Router correctness regression. No rewrite is authorized.

### A2 — Fee-on-transfer / rebasing token behavior
The MVP Router intentionally does not support fee-on-transfer tokens; the Router2 Flow Adapter explicitly rejects unexpected balance deltas. This is an explicit scope boundary, not a Master 2 blocker.

### A3 — Production controls
LQC Flow MVP Factory/Pair/Router are intentionally simpler than Router2/Risk/Governance. Production routing controls live at reviewed Router2/Risk/Governance boundaries. Do not retrofit unrelated privileged controls into Pair/Router during Master 2 without an Integration Gate.

**Implementation-gap conclusion: no mandatory Core code change identified for Master 2 at this point.**

## B. Evidence gaps

### E1 — Current candidate vs deployed runtime identity
Need read-only comparison of current compiled runtime expectations against deployed BSC Testnet Router and, where recoverable, Factory/Pair.

### E2 — Canonical Factory/Pair deployment addresses
Current repository evidence strongly pins the Flow Router but does not provide one canonical Master 2 record containing Factory and Pair addresses/runtime hashes.

### E3 — Full liquidity round-trip evidence
Local tests cover add/remove liquidity. A canonical current-release Testnet evidence bundle for add→LP accounting→remove is not yet pinned in Master 2.

### E4 — Native BNB bidirectional Testnet evidence
Local native-BNB tests pass, but current Master 2 evidence does not yet pin both native directions as current-release Testnet proof.

### E5 — Adapter runtime identity
Historical Router2→Flow execution proves operational compatibility of adapter `0x14db750acf95b469aba3e3880e3f6bc324a2c56d4`, but current candidate-vs-deployed runtime identity remains to be sealed.

## C. Release-impact classification

| Gap | Type | Blocks code completion? | Blocks current Testnet evidence credit? | Requires transaction? |
|---|---|---:|---:|---:|
| E1 runtime identity | Evidence | No | Yes for artifact-identical credit | No |
| E2 Factory/Pair canonical record | Evidence | No | Partial | No |
| E3 liquidity round trip | Evidence | No | Yes for full liquidity Testnet claim | Possibly, only if historical receipts cannot be recovered |
| E4 native BNB directions | Evidence | No | Yes for full native Testnet claim | Possibly |
| E5 Adapter identity | Evidence | No | Yes for current adapter artifact credit | No |

## 2/4 decision

**No mandatory LQC Flow Core implementation change is currently identified.**

Therefore Master 2/5 must not invent code changes. It should first close read-only evidence gaps E1/E2/E5. Only if that comparison reveals actual artifact/config incompatibility may a selective code/deployment change be proposed.

E3/E4 should prefer recovery/reconciliation of historical on-chain evidence. New bounded Testnet transactions are a last resort and require their own fresh review gate.

Next:
**2/5 — evidence-gap closure, beginning with read-only runtime/address reconciliation.**
