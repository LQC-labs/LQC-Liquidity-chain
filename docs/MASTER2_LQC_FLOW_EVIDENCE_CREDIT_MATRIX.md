# Master 2/15 — LQC Flow Evidence Credit Matrix

Status: **2/9 release-evidence classification**

## Purpose

Convert the completed 2/1–2/8 work into explicit release-credit boundaries so repository, Testnet and future audit claims cannot be mixed.

| Capability / claim | Current evidence | Credit |
|---|---|---|
| Flow Core source exists and compiles | current main + CI | IMPLEMENTED / UNIT-INTEGRATION TESTED |
| Flow regression/security/native tests | focused CI | INTEGRATION TESTED |
| Historical Router2 -> Flow swap | pinned BSC Testnet transaction evidence | HISTORICAL TESTNET VERIFIED |
| Router/Adapter live bindings | 2/5 read-only chain observation | CURRENT TESTNET OBSERVED |
| Factory and tLQC/WBNB Pair addresses | 2/5 read-only derivation | CURRENT TESTNET OBSERVED |
| Current artifact == deployed bytecode | 2/5 hash comparison | **NOT VERIFIED** |
| Runtime mismatch cause | 2/7 lineage review | EVIDENCE LINEAGE GAP; NO PROVEN CORE DEFECT |
| Reproducible future build seal | 2/8 CI gate | IMPLEMENTED |
| Full current-release liquidity round trip | no canonical current-release Testnet bundle | **NOT VERIFIED** |
| Both native-BNB directions on current release | local tests only for current release | **NOT VERIFIED ON TESTNET** |
| Independent security audit | not completed in Master 2 | **NOT SECURITY VERIFIED** |
| Production/mainnet readiness | outside Master 2 | **NOT RELEASE READY** |

## Claim rules

1. A local/CI PASS must never be presented as current Testnet verification.
2. Historical Testnet evidence remains historical and must retain its transaction/network context.
3. The current source tree must not be described as byte-for-byte identical to the existing Flow deployment.
4. No redeployment is authorized merely to upgrade an evidence label.
5. Any new Testnet transaction requires a separate bounded review gate and must add evidence that cannot be recovered read-only.
6. Futures evidence and Flow evidence remain separate; neither module inherits the other's release credit.

## 2/9 decision

Master 2 now has explicit evidence-credit boundaries. The remaining material Flow evidence gaps are the canonical current-release liquidity round trip and native-BNB bidirectional Testnet proof. Before considering any new transaction, historical receipts/logs must be searched and reconciled.

## Next

**2/10 — Historical transaction/log recovery for liquidity and native-BNB evidence.**

Read-only recovery first. No wallet, signature or transaction is authorized by 2/10.
