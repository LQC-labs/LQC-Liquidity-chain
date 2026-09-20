# Master 3/3 — Best Execution Proof Domain Separation

Status: verification gate
Base: e20585a0a178d5e12869c197eae28b6ebb49e438

## Goal

Verify that Router 2.0 / Best Execution proof identity cannot be replayed across chain or deployment domains as LQC expands from BSC toward a future LQC Mainnet.

## Required proof bindings

A proof/execution identity must bind all security-relevant execution context, including:

- actual chain domain;
- request tokenIn/tokenOut/amountIn/recipient/slippage/deadline;
- selected DEX/adapter and route bytes/hash;
- quote block and economic outputs/costs;
- candidate ordering/selection where Best Execution is claimed;
- verifier/gateway deployment domain where applicable.

## Required rejection cases

- same route/economics on a different chain;
- same request with a different recipient;
- different adapter or route;
- different candidate ordering/selected index;
- expired request;
- replay of a consumed proof at the enforcement gateway;
- proof produced for one gateway/verifier domain accepted by another, where the gateway proof domain is expected to bind deployment identity.

## Boundary

This stage verifies domain separation and replay resistance. It does not claim Settlement finality, cross-chain settlement, or production readiness.

No deployment or live transaction is authorized.

`activationAuthorized: false`
