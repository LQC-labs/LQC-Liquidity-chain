# LQC Flow DEX — AMM MVP

This package implements the first testable smart-contract layer for **LQC Flow DEX** on EVM-compatible networks such as BNB Smart Chain.

## Included

- `LQCFlowFactory`: permissionless token-pair creation and two-step owner transfer
- `LQCFlowPair`: constant-product (`x*y=k`) pool and ERC-20 LP shares
- `LQCFlowRouter`: token/BNB liquidity add/remove, exact-input swaps, exact-output swaps, and multi-hop paths
- Native BNB wrapping/unwrapping through the configured WBNB contract
- 0.30% swap fee retained in the pool for liquidity providers
- Minimum permanently locked liquidity
- Slippage bounds and transaction deadlines
- Pair-level reentrancy lock and safe ERC-20 transfers
- Local compilation and integration tests
- BSC testnet deployment script
- Static wallet-connected swap interface in `app/`

## Router 2.0 extensibility foundation

The first cross-DEX extension layer is available in \`contracts/router-v2/\`:

- \`ILQCDexAdapter\`: common exact-input quote interface for every reviewed DEX integration
- \`LQCDexRegistry\`: owner-controlled registration, update, pause, removal, metadata, and two-step ownership transfer
- \`LQCQuoteRouter\`: failure-isolated comparison across all enabled adapters with deterministic priority tie-breaking
- \`LQCFlowAdapter\`: connects native LQC Flow direct or multi-hop pool quotes to Router 2.0
- \`PancakeV2Adapter\`: connects reviewed PancakeSwap V2-compatible routers for cross-DEX quote comparison
- \`PancakeV3Adapter\`: validates packed V3 paths and reads PancakeSwap QuoterV2 through an isolated static call
- \`LQCExecutionRouter\`: executes token exact-input swaps only through enabled registry adapters, with minimum-output, deadline, recipient balance verification, exact temporary approvals, and reentrancy protection

New DEXs can be added through reviewed adapters without replacing the quote or execution routers. The BSC testnet deployment script deploys and registers the LQC Flow adapter automatically and optionally registers PancakeSwap when \`PANCAKE_V2_ROUTER_ADDRESS\` is supplied. Exact-input token execution is now available for the LQC Flow and PancakeSwap V2 adapters. Native BNB execution, PancakeSwap V3 execution, automatic best-route execution, split routing, gas-aware scoring, timelocks, and production integrations remain pending.

Router 2.0 is intentionally protocol-neutral: every EVM DEX can be integrated through the same reviewed adapter interfaces and enabled or paused independently in the registry. A DEX is never treated as compatible until its protocol-specific quote and execution adapter, route validation, tests, and security review are complete. Non-EVM liquidity will be connected later through the cross-chain routing layer rather than unsafe direct assumptions.

## Commands

```bash
npm install
npm test
```

To deploy after compilation:

```bash
export BSC_TESTNET_RPC_URL="..."
export DEPLOYER_PRIVATE_KEY="..."
export WBNB_ADDRESS="0x..." # official WBNB for the selected BSC network
export EXPECTED_CHAIN_ID="97" # deployment safety check; defaults to BSC testnet
export FACTORY_OWNER="0x..." # preferably a multisig; optional for testnet
node scripts/deploy.mjs
```

For a complete BSC testnet setup that deploys owner-controlled LQC/Mock USDT tokens, Router 2.0,
creates LQC/USDT and LQC/WBNB pools, records all addresses, and configures the web interface:

```bash
export BSC_TESTNET_RPC_URL="..."
export DEPLOYER_PRIVATE_KEY="..." # never commit this value
export WBNB_ADDRESS="0x..."
npm run deploy:testnet
```

The default mock supplies and pool amounts are configurable environment values for testing only;
they do not define LQC mainnet supply, allocation, valuation, or launch liquidity.
When `FACTORY_OWNER` differs from the deployer, the registry starts a two-step ownership transfer;
the multisig must call `acceptOwnership()` after reviewing the deployment record.

The automated test suite also reproduces the complete bootstrap locally and verifies both pool
creation, Router 2.0 quoting, a capped smoke swap, and rejection when minimum-output protection fails.

After deployment, configure the verified Router, WBNB, and LQC test-token addresses:

```bash
export ROUTER_ADDRESS="0x..."
export QUOTE_ROUTER_ADDRESS="0x..."
export WBNB_ADDRESS="0x..."
export LQC_ADDRESS="0x..."
export REGISTERED_DEXES='[{"id":"0x...","name":"LQC Flow"},{"id":"0x...","name":"PancakeSwap V2"}]'
npm run configure:app
```

The interface remains visibly disabled until all three addresses are configured.

Never commit private keys or `.env` files.

## Current limitations

This is an unaudited testnet MVP, not production-ready software. Fee-on-transfer tokens, permit signatures, protocol-fee accounting, LQC fee conversion/burning, governance timelocks, pausability, price oracles, Router 2.0 cross-DEX aggregation, and the web trading interface are intentionally deferred.

Before any mainnet use, complete independent audits, invariant/fuzz testing, economic simulations, legal review, multisig/timelock setup, token and pool allowlisting decisions, monitoring, and a capped-liquidity testnet/pilot phase.
