# Official 6/5 — BSC Same-chain Intent E2E

This gate closes Stage 6 at repository level by requiring one coherent path:

EIP-712 canonical Intent → Core replay/expiry state → SourceEscrow → Intent/Solver binding → Internal Solver → Router 2.0 → Execution Receipt.

Required invariants:
- canonical EIP-712 identity and domain separation;
- one sender nonce / one intent lifecycle;
- Pending and deadline checks before execution;
- exact route-field binding;
- exact temporary Router approval and approval reset;
- minimum-output and deadline enforcement in Router 2.0;
- atomic rollback if the execution target fails;
- zero residual tokenIn custody in Internal Solver;
- one domain-separated receipt per canonical intent.

Status: repository E2E security gate only. It does not claim a live BSC testnet transaction, deployment, liquidity, or production readiness. Those require separate on-chain evidence.
