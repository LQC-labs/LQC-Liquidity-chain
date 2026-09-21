# Master 5/1 — Oracle Feed Registry Reuse Audit

Status: verification-only

## Purpose

Start Oracle Foundation by auditing existing feed registration/configuration before introducing new mutable registry code.

## Existing capability

Lending `LQCOracleManager` already maintains an asset-keyed configuration containing primary feed, secondary/reference feed, max age, max deviation and enabled state. Configuration is owner-controlled; guardian may disable but cannot re-enable. Feed addresses are configuration inputs rather than hard-coded Core assumptions.

Futures intentionally retains a separate module-specific oracle adapter/configuration domain. The approved Oracle interface boundary prohibits merging Lending and Futures into one shared mutable manager merely for architectural uniformity.

## 5/1 reuse decision

For the current Oracle Foundation baseline, the Lending asset configuration mapping is the existing Feed Registry candidate and MUST be reused unless a concrete cross-module registry requirement demonstrates a gap.

The following remain required boundaries:

- no hard-coded BSC feed addresses in Core accounting;
- module-specific Lending/Futures risk semantics remain independent;
- feed configuration must be governance-controlled and reviewable;
- future chain/provider adapters must remain replaceable without rewriting Core accounting;
- no deployment, feed activation or production authorization occurs in this audit.

`activationAuthorized: false`
