# LQC Proof of Best Execution

Status: **testnet SDK foundation — not a production execution guarantee**

LQC can produce a deterministic receipt explaining why a single DEX or split route was selected.
The proof records the BSC testnet quote block, expiry, assets, amount, slippage policy, every reviewed
candidate's gross output, route cost, net output, price impact, and a hash of its encoded route.

The selected plan records one to four legs, exact input allocation, expected and minimum output,
total route cost, the best single-route comparison, and any split improvement. The SDK rejects a
single route that is not the highest gas-adjusted candidate and rejects a split route unless it
strictly improves on the best single route after cost.

The receipt includes a Keccak-256 `proofHash`. Any modification to its quote context, candidates,
selection, amounts, costs, or protection values invalidates verification. Raw route data is not
included; only its hash is recorded.

This proves consistency of the quoted decision data. It does not prove that off-chain inputs were
honest, guarantee settlement, prevent MEV, replace on-chain minimum-output protection, or constitute
an audit. Production use requires trusted quote collection, block freshness, execution-receipt
binding, monitoring, and independent review.

## Proof-to-Settlement binding

After a successful transaction, `buildSettlementReceipt` binds the original `proofHash` to the
BSC testnet transaction hash, canonical block hash and number, settlement time, recipient, output
asset, expected output, minimum output, and actual received output. It rejects reverted transactions,
wrong-chain evidence, blocks older than the quote, expired execution, and output below the committed
minimum. The resulting Keccak-256 `settlementHash` makes later changes detectable.

This SDK receipt expects independently decoded and canonically confirmed transaction evidence. It
does not itself query an RPC, decode token transfers, establish block finality, or prevent chain
reorganizations. Those checks must be performed by the execution service before receipt creation.

## Canonical settlement verification

`verifyCanonicalSettlement` closes that evidence gap for ERC-20 output routes. It retrieves the
transaction receipt from an RPC provider, requires successful execution, matches the transaction
and recorded block, re-reads the block to detect a reorganization, enforces a configurable 1–100
confirmation threshold, and sums matching `Transfer` logs from the committed output token to the
committed recipient. The decoded total must exactly match the settlement receipt's actual output.

Native BNB output is verified separately by `verifyCanonicalNativeSettlement`. It requires exactly
one `NativeSwapExecuted` event from the explicitly reviewed `LQCNativeRouter`, matches its indexed
recipient and input token, requires `nativeIn == false`, and reconciles both input and actual BNB
output amounts. A spoofed emitter, duplicate event, wrong direction, or inconsistent amount fails
closed. The RPC must be independently trusted and production confirmation depth remains a
governance risk parameter.

## Execution intent and quote API foundation

Before wallet submission, `buildExecutionIntent` binds the selected proof to the sender, reviewed
execution contract, calldata hash, native value, pending nonce, and deadline. The intent-bound
settlement evidence rejects nonce replay, target replacement, calldata substitution, sender changes,
and value changes. This is local deterministic evidence; wallet signature verification and canonical
transaction decoding remain required before production use.

`buildQuoteApiRequest` provides the versioned request envelope for a future read-only multi-DEX quote
API. It binds chain 97, token pair, exact input, a client request id, and a validity window of at most
60 seconds. `validateQuoteApiResponse` accepts a response only when its Best Execution Proof matches
the complete request. The transport-neutral `quote-api-gateway.mjs` foundation adds hashed bearer-key
authentication, per-client fixed-window quotas, request tracing, canonical request-hash validation,
server-supplied cryptographic proof verification, exact request/proof context matching, and stable
errors that do not leak upstream details. A completed request id is idempotent until expiry: an exact
retry receives the same proof, while reuse of that id with different content fails closed. It does not
open a network listener, store raw
API keys, submit transactions, or expose a public production service.

## Display-to-execution binding

The browser keeps the complete verified proof with its quote snapshot. Immediately before building a
wallet request, it checks the proof again, rejects expiry or trade changes, requires the same single or
split route and exact per-leg input allocations, and requires every refreshed leg output to remain at
or above its committed minimum. A changed route therefore requires a new displayed proof before any
wallet signature request. This is client-side fail-closed validation and does not replace settlement
verification or an independent audit.

The final wallet transaction uses the proof expiry as its on-chain deadline. Before simulation, an
execution intent binds the proof to the wallet address, reviewed execution contract, calldata hash,
native value, pending nonce and deadline. The same intent is rebuilt immediately before
`eth_sendTransaction`; any substitution between simulation and wallet submission is rejected.
