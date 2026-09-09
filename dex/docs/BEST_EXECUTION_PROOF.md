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
