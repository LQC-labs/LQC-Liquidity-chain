# Lending Stage4 Root-Cause and Reuse Boundary

Status: **Architecture Freeze G3 forensic decision**

## Verified sequence

The Lending deployer is `0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB`.

Verified deployment evidence:
- nonce 105: LQCOracleManager — Stage1 verified.
- nonce 106: LQCInterestRateModel — Stage1 verified.
- nonce 107: LQCLendingMarketRegistry — Stage2 verified.
- nonce 108: LQCLendingInterestIndex — Stage2 verified.
- nonce 109: LQCLendingCore — deployed at `0x3a3C7303829318d4cbA955c71812679DAF5699ca`; later Stage4 review records it as verified Core.

Stage4 preflight then observed deployer nonce 110 and predicted LiquidationEngine `0xEb948704A4D4c8d8bB965BA1feF086FCE3c35345`.

The Stage4 review packet records **transactionOccurred: false**. Therefore that predicted LiquidationEngine address is not deployment evidence and must never be treated as a deployed contract.

## Nonce incident

Repository history shows a dedicated forensic effort:
- PR #213 added a read-only tracer for deployer nonces 110-114.
- PR #215 pinned ten Futures testnet addresses to classify whether consumed Lending-deployer nonces were related to Futures activity.
- The tracer classifies a transfer to `0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB` of approximately 1 tBNB as known Futures funding; other transactions require review.

However, the repository does **not** contain a sealed evidence artifact listing the final transaction hash/classification for each of nonces 110, 111, 112, 113 and 114. Public web indexing did not supply a reliable substitute during this Architecture Freeze review.

Therefore the exact transaction-by-transaction classification of all five consumed nonces is **not proven by the repository evidence**. It must not be reconstructed from memory or guessed.

## Root cause

The operational root cause is nevertheless bounded sufficiently for architecture:

**Stage4 depended on a predicted CREATE address derived from deployer nonce 110. The deployer nonce subsequently ceased to be a safe Stage4 assumption because the same deployer account was used outside the frozen Stage4 transaction sequence, including documented Futures-funding classification work. The stale predicted address and stale packet therefore became invalid.**

This is a deployment-process / nonce-isolation failure, not evidence that Stage1-3 Lending contract logic failed.

## Reuse decision

- Stage1 OracleManager: retain as historical verified deployment candidate; revalidate runtime/config before reuse.
- Stage1 InterestRateModel: retain; revalidate runtime/config.
- Stage2 MarketRegistry: retain; revalidate runtime/config and current owner/guardian/oracle binding.
- Stage2 InterestIndex: retain; revalidate runtime/config and current Core binding.
- Stage3 LendingCore: retain; revalidate runtime/config and current Registry/Index/LiquidationEngine binding.
- Stage4 historical predicted LiquidationEngine address: **REJECT / DO NOT REUSE**.
- Stage4 historical execution packet: **SUPERSEDED / DO NOT EXECUTE**.

No Stage1-3 contract is redeployed merely because the deployer nonce advanced.

## Future deployment rule

Any future Stage4 deployment must:
1. use a dedicated Lending deployment identity or an isolated deployment mechanism whose nonce/state is not shared with Futures or unrelated work;
2. read current chain state immediately before review;
3. compile from a pinned commit and reviewed dependency lock;
4. derive a fresh LiquidationEngine address only from the current reviewed deployment state;
5. regenerate gas, nonce/address, constructor binding and artifact-hash evidence;
6. require a fresh explicit deployment gate;
7. verify the deployed runtime and bindings before market activation.

A stale predicted CREATE address is never portable across nonce changes.

## G3 exit

Architecture G3 is resolved at the root-cause/reuse-policy level. The exact hashes for every historical nonce 110-114 remain an evidence gap, explicitly recorded rather than guessed. This gap does not justify discarding verified Stage1-3 contracts, and it does not authorize Stage4 deployment.

Next engineering work remains blocked until the Master Plan reaches the reviewed Lending deployment gate.
