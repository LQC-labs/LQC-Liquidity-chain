# Master 2/15 — LQC Flow Evidence Pin

Status: **2/1 current implementation and evidence pin**

## Current Core

Pinned from current main:
- LQCFlowFactory — pair creation and ownership transfer.
- LQCFlowPair — constant-product AMM, 30 bps swap fee, LP mint/burn, reserve sync, reentrancy lock.
- LQCFlowRouter — token/token and BNB/WBNB liquidity and swaps, exact-in/exact-out, multihop, deadline/minOut/maxIn.
- LQCFlowAdapter — Router 2.0 quote/execution boundary, endpoint/path checks, exact-input balance-delta check, approval cleanup and residual-token rejection.

## Current regression inventory

Relevant repository tests include:
- amm.test.mjs
- amm-core-security-boundaries.test.mjs
- amm-factory-pair-boundaries.test.mjs
- amm-liquidity-boundaries.test.mjs
- amm-minout-deadline-boundaries.test.mjs
- amm-multihop-boundaries.test.mjs
- amm-native-bnb-boundaries.test.mjs
- amm-swap-boundaries.test.mjs
- native-router.test.mjs
- Router2 LQC Flow route/execution/final-state/finalization tests.

## Existing BSC Testnet evidence

Network: BSC Testnet chainId 97.

Pinned historical LQC Flow Router:
`0xA3E1fbe94055e7A8971b3994C7025B3c16273a24`

Pinned Router 2.0 LQC Flow Adapter:
`0x14db750acf95b469aba3e74032e6db61087ef4cd`

A bounded Router2→LQC Flow execution is recorded:
- tx: `0xc1da9b744cf954802a59315ac4ce7cc38b1fac952ed6dd8691fb7d2336e7c4d6`
- amountIn: 10 tLQC
- amountOut: 532721073104236 WBNB units
- minimumAmountOut: 527393862373193
- receipt success: true
- LQC Flow Swap event: true
- user allowance after execution: 0
- Router→Adapter allowance after execution: 0

Route-comparison evidence also records LQC Flow and Pancake V3 as two comparable routes for the same tLQC/WBNB direction.

Governance evidence records 4/7 Governance Safe control for LQC Flow execution caps:
- tLQC cap: 1000 tLQC
- WBNB cap: 0.01 WBNB.

## Evidence limitation

Historical Testnet success does not prove that the currently compiled Factory/Pair/Router/Adapter bytecode exactly matches the deployed historical bytecode. Master 2 must compare current candidate artifacts/runtime behavior before granting current-release Testnet credit.

The repository evidence found in this pass strongly proves a bounded Router2→LQC Flow swap, but it is not by itself a complete canonical evidence bundle for:
- current Factory deployment/runtime hash;
- current Pair deployment/runtime hash;
- current Flow Router runtime hash;
- current candidate-vs-deployed bytecode equality;
- full add/remove liquidity round trip at the current pinned revision;
- both native-BNB swap directions at the current pinned revision.

These are evidence gaps, not automatic implementation failures.

## 2/1 decision

Reuse the current LQC Flow implementation and historical Testnet evidence. Do not redeploy or rewrite at 2/1.

Next:
**2/2 — inspect/run the current local regression/invariant gate and identify any code-level failures before candidate-vs-Testnet reconciliation.**
