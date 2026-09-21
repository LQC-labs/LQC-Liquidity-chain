# Master 4/1 — Vault / Liquidity Reuse Audit

Status: verification-only
Base: a961b3b2ff96fc10a339c218289155162b1aba78

## Purpose

Start Master 4 by auditing the existing `LQCLiquidityVault` before adding new Vault/Liquidity code. Reuse is preferred over duplication.

## Existing capability found

The current vault already contains:
- single-asset share accounting;
- explicit `accountedAssets` accounting that excludes unsolicited donations;
- deposit cap and deposit pause;
- strategy debt, strategy cap and bounded loss controls;
- strategy allocation/recall and emergency recall;
- insolvency checks and full-backing checks;
- two-step ownership transfer;
- separate pause and strategy admin roles;
- non-reentrancy and transfer-behaviour checks.

## Master 4 reuse decision

These capabilities are candidates for reuse and MUST NOT be reimplemented until a gap is demonstrated.

4/1 is read-only. It does not deploy, upgrade, allocate, recall, deposit, withdraw, sign, or broadcast.

## Boundaries to preserve

- Vault accounting remains independent from Futures position/margin accounting.
- Lending may consume reviewed Vault interfaces later but cannot silently mutate Vault share accounting.
- Router may request liquidity execution through reviewed interfaces; it does not become Vault accounting authority.
- Intent/Solver cannot bypass Vault authorization, caps, pause state, or loss limits.
- chain-specific strategy integrations remain behind adapters.
- production activation remains forbidden.

`activationAuthorized: false`
