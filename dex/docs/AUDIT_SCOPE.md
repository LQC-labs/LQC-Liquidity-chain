# LQC Flow DEX and Router 2.0 — Audit Scope

Status: **pre-audit, unaudited testnet MVP**

## In-scope production candidates

- LQC Flow AMM: `LQCFlowFactory`, `LQCFlowPair`, `LQCFlowRouter`
- Router 2.0: registry, quote, split optimizer, auto, execution, native router, gas-cost oracle
- Governance and risk: timelock, emergency controller, risk registry
- Adapters: LQC Flow, PancakeSwap V2, PancakeSwap V3 quote and execution adapters
- Liquidity Vault V1, its strategy interface, and the non-yielding reference strategy adapter
- Shared interfaces, math, and safe-transfer libraries used by those contracts
- BSC testnet deployment and validation scripts
- Browser route encoding and execution-plan SDK

Test tokens and mocks are excluded from production deployment but remain in scope as test infrastructure.

## Priority security properties

1. User funds and allowances are not retained after successful or reverted execution.
2. Every split route is atomic; one failed leg reverts all balances, pool state, and risk usage.
3. Disabled or unregistered DEX adapters cannot quote or execute.
4. Duplicate DEX legs cannot bypass DEX/token caps.
5. Token, transaction, DEX, and daily limits cannot be expanded by the risk role.
6. Guardians may pause but cannot resume, move funds, add adapters, or increase limits.
7. Structural changes are controlled by timelocked governance.
8. Price feeds enforce freshness, positive values, and configured deviation limits.
9. V3 paths enforce approved fee tiers, pools, endpoints, and hop limits.
10. Unsupported token behavior is rejected without leaving custody or accounting residue.
11. Vault strategy exposure cannot exceed its governance cap, donations cannot be deployed as
    depositor capital, and normal recalls cannot realize losses above the configured bound.
12. A strategy cannot be replaced with outstanding debt; emergency loss overrides require full
    shutdown and governance authorization.

## Reproducible baseline

```bash
cd dex
npm ci
npm test
```

The repository CI runs the same locked installation, compilation, and complete automated test suite on every DEX-related pull request and `main` branch change.

## Explicit exclusions and unresolved work

- no production deployment or mainnet-readiness claim;
- no completed independent audit or bug bounty;
- fee-on-transfer and rebasing token execution remain unsupported;
- production oracle addresses and parameters are not finalized;
- final multisig signers, timelock ownership, allowlists, and caps remain pending;
- protocol-fee accounting, LQC fee conversion or burning, and permit signatures are deferred;
- production yield strategies are excluded; the included idle adapter is a non-yielding reference;
- lending, bridge, and perpetual modules require separate scope and audits.

Each audit engagement must pin the exact commit SHA, compiler version, optimizer settings, deployment configuration, and contract addresses reviewed.
