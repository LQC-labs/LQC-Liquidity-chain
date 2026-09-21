# Master 7/3 — Futures Current Artifact / BSC Testnet Deployment Lineage

Status: **read-only reconciliation gate**

## Purpose

Determine whether the recorded BSC Testnet Futures contracts still correspond to the current compiled artifacts, without redeploying or mutating the chain.

This gate deliberately separates:

- historical on-chain deployment evidence;
- current repository source/artifacts;
- the newly added 7/2 runtime TWAP reference;
- production-readiness claims.

## Recorded BSC Testnet stack

- Registry: `0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0`
- Vault: `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`
- Oracle: `0xbf6a446c5e17228e70e45645ab47f751bdfc4b41`
- Engine: `0xe4f1320c8709631776c7e39e0916584935882525`

The historical Oracle is explicitly the **test-only MockLQCFuturesOracle**, not the current production-style Aggregator/TWAP oracle stack.

## Read-only verification

The lineage script:

1. checks chainId 97;
2. fetches each recorded deployment transaction and receipt;
3. requires successful contract-creation receipts;
4. requires the recorded deployer;
5. requires receipt contractAddress to match the recorded address;
6. fetches live runtime bytecode;
7. compares it against the current compiled runtime;
8. masks compiler-reported immutable slots before runtime comparison where needed;
9. verifies Registry/Vault owner and Vault↔Engine↔Registry wiring;
10. emits a machine-readable report with no transaction path.

## Interpretation

A current-runtime match means the recorded deployed bytecode lineage still matches the current artifact for that historical contract type.

A mismatch does **not** trigger an automatic redeployment. It is classified as deployment/artifact divergence for the next planning step.

The 7/2 `LQCV3TwapReferenceAdapter` is not part of the historical deployed stack and must remain repository-only until a separately approved Testnet deployment/reconfiguration step.

## Safety boundary

`activationAuthorized: false`

`transactionOccurred: false`

This gate performs no deployment, no Oracle reconfiguration, no market activation and no user-fund action.

## Next

After the live report is reviewed:

**7/4 Perp Accounting Gap Review — Funding / Fees / Partial Close / Insurance / ADL**

Only actual on-chain gaps should move into 7/5 implementation.


## Live reconciliation result — 2026-09-22

The read-only chain-97 workflow returned:

- status: `RECONCILED_READ_ONLY`
- currentArtifactLineage: `ALL_RECORDED_RUNTIMES_MATCH_CURRENT_ARTIFACTS`
- activationAuthorized: `false`
- transactionOccurred: `false`
- productionOracleReady: `false`

All four recorded deployment transactions were successful contract-creation transactions from the approved Futures deployer, and all four receipt contract addresses matched the frozen deployment record.

Current-artifact runtime lineage:

| Contract | Result | Current/on-chain normalized runtime hash |
|---|---|---|
| Registry | CURRENT_ARTIFACT_RUNTIME_MATCH | `0x133f59f02a8ae90873ceef749b582e4eabe2daad5e595326fd660ea0f7d2233e` |
| Vault | CURRENT_ARTIFACT_RUNTIME_MATCH | `0x0e091b0e90894cb9356d508d94c8235039b439cab04b9e3ec03f2b20f202dec5` |
| Oracle | CURRENT_ARTIFACT_RUNTIME_MATCH — **test-only MockLQCFuturesOracle** | `0xf14dcf21954cb7f7ea1ead4b9ca936f7093580faf2b943abf413120dddffa5bc` |
| Engine | CURRENT_ARTIFACT_RUNTIME_MATCH after compiler immutable-slot normalization | `0x34a3ca00f58fbc4de94a9ec8514694e69e839e6721deb5a3c4f0d8b5eec67204` |

The live wiring also matched the frozen record:

- Registry.owner = `0x89d992f696B40ABbDB6610144faeF336911D8175`
- Vault.owner = `0x89d992f696B40ABbDB6610144faeF336911D8175`
- Vault.engine = `0xe4f1320c8709631776C7e39e0916584935882525`
- Engine.registry = `0xFbD1c5c8DBbDaDF3EB834F351366dAF55f2D73B0`
- Engine.vault = `0xb532C65294A7b35CA510a7DF025E934fa17C8D7e`

### Important interpretation

The deployed Registry, Vault, Mock Oracle and MVP Engine remain exact current-artifact lineage matches.

This **does not** make the deployed Oracle production-ready: that address is still the explicitly test-only Mock Oracle. The 7/2 Aggregator + independent V3 TWAP reference path remains repository-only until a separately approved deployment/reconfiguration stage.

Therefore 7/3 closes the code-lineage uncertainty without spending gas or changing the existing Testnet stack.
