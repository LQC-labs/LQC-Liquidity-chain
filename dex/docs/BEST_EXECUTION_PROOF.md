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
