# Master 6/12 — Clean Lending Multi-RPC Preflight

Status: preparation / verification only

This gate consumes the deterministic clean-stack deployment packet and performs only read-only BSC Testnet checks through two or more RPC providers.

Checks:

1. every RPC reports chainId 97;
2. the deployer's pending nonce exactly matches the reviewed packet;
3. every predicted deployment address is recomputed and still empty;
4. every CREATE transaction can be gas-estimated;
5. gas estimates across RPCs stay within a 5% tolerance;
6. a 20% gas-limit buffer is applied per deployment;
7. the deployer has enough testnet BNB for the full conservative deployment budget;
8. the packet remains `activationAuthorized: false`;
9. the market remains disabled for the later 6/13 E2E activation gate.

The preflight does not sign or broadcast any transaction. Any nonce drift, occupied predicted address, chain mismatch, RPC disagreement or insufficient balance invalidates the packet and requires regeneration.

`activationAuthorized: false`
