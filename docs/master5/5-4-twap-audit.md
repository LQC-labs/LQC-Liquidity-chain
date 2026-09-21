# Master 5/4 — TWAP Reuse / Gap Audit

Status: verification-only

## Purpose

Audit existing TWAP work before adding Oracle Foundation TWAP runtime code.

## Existing evidence

The repository already contains a Futures V3 TWAP qualification and price-conversion path. It validates exact pool token identity, minimum liquidity, initialized/unlocked state, observation cardinality, requested observation history, bounded observation window, token decimals and BSC Testnet chain identity. Arithmetic mean tick handling floors negative non-integral values. Tick-to-price conversion is integer-only, direction-aware, decimal-normalized to 1e18 and rejects unsupported/extreme unsafe outputs.

## Reuse decision

These TWAP source-qualification and conversion utilities are reusable evidence and MUST NOT be duplicated.

## Gap classification

The existing path is Futures preflight/read-only qualification. It is not yet a shared Oracle Foundation runtime TWAP feed and is intentionally BSC-Testnet-qualified. Before any runtime integration, a later implementation decision must preserve module isolation and move chain/provider/pool identity into reviewed configuration/adapters rather than coupling Core accounting to BSC or one DEX pool.

5/4 therefore records reuse and the runtime gap; it does not authorize deployment, oracle activation, borrowing, liquidation or Futures trading.

`activationAuthorized: false`
