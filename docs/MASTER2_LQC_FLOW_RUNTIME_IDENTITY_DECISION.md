# Master 2/15 — LQC Flow Runtime Identity Decision

Status: **2/6 runtime identity decision**

## Evidence from 2/5

The read-only BSC Testnet reconciliation completed successfully as an observation job, but it did **not** establish artifact identity.

Observed canonical addresses:
- Router: `0xA3E1fbe94055e7A8971b3994C7025B3c16273a24`
- Adapter: `0x14db750acf95b469aba3e74032e6db61087ef4cd`
- Factory: `0x4e015645690bA9c7DcfA7961C2c44eb4D5db7c09`
- Pair (tLQC/WBNB): `0x0E408bFe3bfcc65cdB55daA6b75f2a5a0c020B84`

Bindings passed:
- Router WBNB -> reviewed BSC Testnet WBNB.
- Adapter Flow Router -> pinned LQC Flow Router.
- Factory returns a live tLQC/WBNB Pair.

## Runtime identity result

Current compiled runtime hashes do not equal the deployed runtime hashes for Router, Adapter, Factory, or Pair.

Therefore:
- 2/5 is **PASS as a read-only reconciliation mechanism**.
- 2/5 is **NOT PASS for artifact-identical Testnet release credit**.
- Historical operational swap evidence remains valid as historical evidence.
- No claim may be made that the current main artifacts are byte-for-byte identical to the deployed BSC Testnet contracts.

## Safety decision

Do **not** redeploy or mutate Testnet merely because the hashes differ.

The mismatch must first be classified. Likely classes include compiler/settings/metadata lineage, constructor/deployment lineage, or genuine source/artifact drift. Classification must be evidence-driven.

No DEX Core rewrite is authorized by this result alone.

Futures remains an isolated execution/accounting failure domain. Master 2 investigation must not modify Futures production code or its Testnet state.

## 2/6 completion rule

2/6 is complete when the repository records:
1. canonical deployed Flow addresses recovered by read-only calls;
2. exact current/deployed runtime hashes;
3. the fact that all four runtime hashes differ;
4. the release-credit consequence;
5. a no-redeploy/no-rewrite decision pending lineage classification.

## Next

**2/7 — Runtime mismatch lineage classification.**

Compare compiler configuration, metadata behavior, historical deployment/source lineage and available artifacts. Prefer proving the cause without a transaction. Only a demonstrated functional or security incompatibility may open a selective implementation/deployment gate.
