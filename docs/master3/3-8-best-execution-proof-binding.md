# Master 3/8 — Best Execution Proof Binding Gate

Status: implementation gate
Base: cff6cd5fd26fb0f54728b98115d225886e68eab4

## Purpose

Bind the deterministic Master 3/7 selection result to an immutable proof digest before any execution layer may consume it.

## Binding rules

1. Proof input must contain stage, selected route, canonical ordered candidates, chain ID, router address, registry version and quote expiry.
2. Canonical serialization is explicit and stable; object insertion order is not trusted.
3. The proof digest is SHA-256 over the canonical UTF-8 payload.
4. Expired quotes, wrong domains, missing deployment identity, duplicate route IDs, or non-deterministic candidate order fail closed.
5. Futures, Lending and Intent execution state are excluded from the proof payload.
6. This stage never signs, broadcasts, deploys, swaps, or mutates liquidity.

`activationAuthorized: false`

PASS proves only deterministic binding between a Router 2.0 selection and its declared execution domain.
