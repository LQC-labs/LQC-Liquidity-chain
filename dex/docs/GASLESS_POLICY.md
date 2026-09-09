# LQC Gasless Policy V1

Status: **implemented policy foundation; no paymaster, relayer, sponsorship funds, or deployment**.

`LQCGaslessPolicy` converts the adopted whitepaper conditions into an on-chain authorization boundary for a future BSC testnet paymaster or signed relay.

## Enforced in V1

- explicit configured chain ID
- approved transaction targets and tokens
- minimum oracle-derived notional input
- sponsorship only when the user's native balance is below the estimated gas cost
- maximum sponsored gas per transaction
- maximum five sponsored transactions per wallet per UTC day
- protocol-wide daily sponsored-gas budget
- dedicated executor
- guardian pause with governance-only recovery
- two-step ownership transfer

## Integration boundaries

The contract does not verify user signatures, calculate USD prices, relay calls, hold user assets, or reimburse a bundler. Those responsibilities belong to a separately reviewed smart-account/paymaster or signed-relay implementation. The executor must provide an oracle-derived notional and a bounded gas estimate immediately before sponsorship authorization.

Anti-Sybil screening, stablecoin cost recovery after the free quota, sanctions/abuse controls, funding operations, monitoring, and legal review remain off-chain or future integration work.

No mainnet deployment is permitted before independent audit, remediation, governance approval, and controlled BSC testnet evidence.
