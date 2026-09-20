# Master 2/15 — LQC Flow Historical Evidence Recovery

Status: **2/10 implementation**

2/10 searches the existing BSC Testnet state before authorizing any new transaction.

The read-only recovery gate:
- derives the canonical Factory and tLQC/WBNB Pair from the pinned Flow Router;
- estimates the Pair first-code block by historical `eth_getCode`;
- recovers Pair Mint, Burn and Swap logs;
- re-checks the already pinned Router2→Flow transaction receipt;
- reports whether historical Mint+Burn events provide a liquidity round-trip candidate;
- explicitly does not treat Pair events alone as proof of native BNB wrapping/unwrapping direction.

Safety: RPC reads only. No wallet, signature, approval, transfer, liquidity mutation or deployment.

A recovered event is evidence only after its transaction context is classified. New Testnet transactions remain unauthorized at this stage.
