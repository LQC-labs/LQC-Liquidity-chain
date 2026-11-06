# Security and operational limits

Funding rights/debt and signed RAY1e27 remainders must survive reductions, close, liquidation and ADL. Actual verified cash alone decreases payable/receivable. Never collateralize receivables or automatically charge Funding shortfalls to Insurance/Treasury. Preserve PnL/maintenance priority and prevent residualBadDebt double counting.

Registry recovery requires authenticated fixed code and immutable bindings, approved Oracle/Reference, exact500bps, freshness, zero verified residual debt and actual liquidation prerequisites. HALTED is normal initial registration, not registration failure. Governance recovery is at most900 seconds and one-use; Guardian only tightens.

The Vault deposit receipt/strict-return/backing/reentrancy checks assume truthful stable token behavior. They do not prove balanceOf honesty, source ownership, future rebases or Proxy history. Existing owner allowlist is not full token attestation. Four unsupported-token limitation tests intentionally reproduce successful attacks/insolvency; their PASS is not collateral safety certification.

All default UI pages have neutral zero addresses and reviewOnly enabled. Missing review flags fail closed. Provider queries/subscriptions/sends are blocked in the default review profile. Only explicit isolated synthetic test profiles exercise transaction-shaped mock calls. No scripts load remote code. The actual Engine remains the final policy authority.

Operational source imports never reference tests, historical registries or open-mint/Mock Oracle contracts. test/, baseline/OriginalRegistry.sol, legacy-ui/ and harness/ are test-only. src/baseline contains the actual inherited Aggregator/interface dependency and is not a mock directory. Legacy test addresses are historical assertions only.

Internal authority and MIT policy for self-authored candidate material are accepted under I26/I28 user confirmation/approval. The I27 minimum Oracle wording is approved for this isolated package. Upstream provenance/notices, real provider/token/Proxy/wallet/finality and Pages/external automation assurance remain BLOCKED or NOT_RUN as documented. D05/D06, Pyth SDK, testnet transfer, operational liquidation and conditional ADL activation remain BLOCKED.
