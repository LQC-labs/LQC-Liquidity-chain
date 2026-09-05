# LQC Development Status

**Review date:** September 5, 2026  
**Primary implementation:** LQC Flow DEX and LQC Router 2.0  
**Target environment:** EVM-compatible networks, with BNB Smart Chain testnet first  
**Release state:** Unaudited local/testnet-oriented MVP; not production ready

## 1. Status Summary

Liquidity Chain is developing non-custodial infrastructure for discovering and executing efficient trades across fragmented DEX liquidity. The working code currently focuses on AMM fundamentals, route discovery, controlled external-DEX integration, and split execution.

| Area | Status | Verifiable evidence |
|---|---|---|
| Constant-product AMM | Implemented and locally tested | `dex/contracts/LQCFlowFactory.sol`, `LQCFlowPair.sol`, `LQCFlowRouter.sol` |
| Best-route quoting | Implemented and locally tested | `LQCFlowQuoter.sol` |
| Adapter-based Router 2.0 | Implemented and locally tested | `LQCFlowRouterV2.sol` |
| Uniswap V2-compatible adapter | Implemented and locally tested | `dex/contracts/adapters/UniswapV2DEXAdapter.sol` |
| Native BNB routes | Implemented and locally tested | Router V1 and Router V2 tests |
| ERC-20 split execution | Implemented and locally tested | `swapSplitExactInput` and split-route tests |
| Off-chain route optimization | Implemented and locally tested | `dex/sdk/route-optimizer.mjs` |
| Browser route comparison | Implemented; static syntax validated | `dex/app/route-optimizer.js`, `dex/app/app.js` |
| BSC testnet tooling | Implemented; live deployment pending | `dex/scripts/verify-testnet.mjs`, deployment scripts |
| Independent security audit | Not started | Required before production use |
| Production/mainnet deployment | Not started | Depends on audit and release gates |

## 2. Implemented Capabilities

### AMM and liquidity

- Permissionless token-pair creation with deterministic pair registration
- Constant-product swaps with a 0.30% pool fee
- LP-share minting, burning, and permanently locked minimum liquidity
- Exact-input and exact-output token swaps
- Token-to-token, BNB-to-token, and token-to-BNB flows
- Multi-hop paths, slippage bounds, deadlines, and excess-BNB refunds

### Router 2.0

- Owner-managed allowlist for DEX adapter contracts
- Up to 16 candidate routes for best-route quotation
- Best-output execution across enabled adapters
- Up to 8 ERC-20 split legs with basis-point allocations totaling 10,000
- Global minimum-output enforcement based on actual balance received
- Two-step ownership transfer
- Native BNB wrapping and unwrapping through configured WBNB
- Refund of unused input and reset of temporary token approvals

### Route optimization and application

- Direct, one-hop, and cycle-free two-hop candidate generation in the SDK
- Output-denominated gas-cost adjustment when a gas estimator is supplied
- Automatic two-way split search with configurable allocation steps
- Browser comparison of single and two-way ERC-20 routes
- Browser split selection only when expected output improves by more than 0.10%
- Display of selected DEX allocation, token paths, expected output, minimum output, and estimated split benefit
- Quote refresh immediately before transaction submission

Native-BNB split execution is not implemented; native-BNB trades use a single optimal route.

## 3. Validation Snapshot

The latest local validation produced:

- 17 Solidity source files compiled successfully
- 30 automated tests passed
- JavaScript syntax checks passed for application and configuration scripts
- Git whitespace/error validation passed

Run the same verification locally:

```bash
cd dex
npm install
npm test
node --check app/app.js
node --check app/route-optimizer.js
node --check scripts/configure-app.mjs
```

Passing local tests is not equivalent to an independent audit, formal verification, public testnet validation, or production approval.

## 4. Token and Project Facts

- Token ticker: **LQC**
- Initial target chain: **BNB Smart Chain**
- Approved design total supply: **1,000,000,000 LQC**
- Planned TGE circulation: **150,000,000 LQC (15%)**
- Token contract address: not yet published
- Production Router addresses: not yet published

Earlier documents using a 2.1 billion supply are superseded. The approved allocation and release framework is maintained in the repository [README](README.md). On-chain supply controls and vesting contracts remain pending implementation and verification.

## 5. Pending Work

Before any production use, the project requires:

1. Token contract, vesting, and supply-control implementation
2. Expanded unit, integration, invariant, fuzz, and fork tests
3. BSC testnet deployment with verified source and published addresses
4. Controlled adapter and token allowlisting
5. Independent smart-contract audit and remediation
6. Multisig and timelock administration
7. Monitoring, incident response, and emergency-pause controls
8. Legal and regulatory review
9. Capped-liquidity pilot with defined transaction and TVL limits

Lending, oracle, bridge, fee burning, staking, governance, and an independent mainnet are roadmap items and are not represented as deployed services.

## 6. Change Discipline

Development claims in this repository must remain traceable to source code, tests, verified deployments, or published third-party evidence. Material changes to supply, circulation, vesting, privileged roles, contract addresses, or security assumptions must be disclosed and reconciled across the codebase, whitepaper, website, and review documents.
