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
