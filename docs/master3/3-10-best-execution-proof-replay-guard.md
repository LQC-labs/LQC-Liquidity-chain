# Master 3/10 — Best Execution Proof Replay Guard

Status: implementation gate
Base: a2f1bc998806011b635ea2135543eb4cfb3a8448

## Purpose

Prevent a valid Router 2.0 Best Execution proof from being consumed more than once or replayed across a different execution context.

## Rules

1. A replay key binds proof digest, selected route, chain ID, router address and request nonce.
2. A consumed replay key is rejected fail-closed.
3. Nonce must be a canonical non-negative integer and is part of the immutable execution context.
4. Chain/router/route must already match the validated 3/9 consumption result.
5. Futures, Lending and Intent state cannot participate in DEX replay state.
6. The guard exposes a pure verification transition; persistence/transaction broadcast is outside this stage.

`activationAuthorized: false`
