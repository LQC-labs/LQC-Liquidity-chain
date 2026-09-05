# LQC Flow DEX — AMM MVP

This package implements the first testable smart-contract layer for **LQC Flow DEX** on EVM-compatible networks such as BNB Smart Chain.

## Included

- `LQCFlowFactory`: permissionless token-pair creation and two-step owner transfer
- `LQCFlowPair`: constant-product (`x*y=k`) pool and ERC-20 LP shares
- `LQCFlowRouter`: token/BNB liquidity add/remove, exact-input swaps, exact-output swaps, and multi-hop paths
- `LQCFlowQuoter`: compares up to 16 candidate routes and selects the highest-output viable path
- `LQCFlowRouterV2`: compares approved external-DEX adapters and executes the best token or native-BNB route
- Router V2 split execution: divides one ERC-20 trade across up to 8 approved DEX routes using basis-point allocations
- `sdk/route-optimizer.mjs`: discovers direct, one-hop, and two-hop routes across up to 16 DEX adapters and returns the best executable route
- `UniswapV2DEXAdapter`: integration layer for PancakeSwap V2, Biswap, and compatible routers
- Native BNB wrapping/unwrapping through the configured WBNB contract
- 0.30% swap fee retained in the pool for liquidity providers
- Minimum permanently locked liquidity
- Slippage bounds and transaction deadlines
- Pair-level reentrancy lock and safe ERC-20 transfers
- Local compilation plus AMM, route-selection, and security-boundary integration tests
- BSC testnet deployment script
- Static wallet-connected swap interface in `app/`
- Trading UI compares single and two-way split routes, displays each DEX allocation, full paths, expected improvement, price impact, indicative network fee, expected output, and minimum output when Router V2 is configured

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

Validate the official BSC testnet contracts without using a private key:

```bash
npm run verify:testnet
```

After Router V2 is deployed, deploy its PancakeSwap V2 adapter:

```bash
export ROUTER_V2_ADDRESS="0x..."
export DEPLOYER_PRIVATE_KEY="..."
npm run deploy:pancake-adapter
```

The adapter script verifies chain ID 97, Router V2 WBNB, PancakeSwap WBNB, and PancakeSwap Factory before deployment. It enables the adapter automatically only when the deployer is the Router V2 owner; otherwise it prints the exact multisig action required.

## Optimal route guidance

The route optimizer generates direct and connector-token paths, requests every configured DEX adapter quote in parallel, ignores unavailable pools, and ranks viable results by net output after pool fee, price impact, and an optional output-token-denominated gas estimate. It returns the selected adapter, full token path, expected and net output, slippage-adjusted minimum output, and ready-to-submit Router V2 arrays. The two-way split optimizer tests allocation steps across route pairs and returns the highest-net-output split plus Router V2 execution arrays. Quotes must be refreshed immediately before transaction submission.

After deployment, configure the verified Router, WBNB, and LQC test-token addresses:

```bash
export ROUTER_ADDRESS="0x..."
export WBNB_ADDRESS="0x..."
export LQC_ADDRESS="0x..."
npm run configure:app
```

The interface remains visibly disabled until all three addresses are configured.

For Router V2 mode, also configure `ROUTER_V2_ADDRESS` and `PANCAKE_ADAPTER_ADDRESS`. The UI refreshes quotes immediately before submission, automatically uses a two-way ERC-20 split when it improves output by more than 0.10%, and calls the appropriate split, token/token, BNB/token, or token/BNB Router V2 entry point. Native-BNB trades remain single-route because Router V2 split execution accepts ERC-20 inputs. When Router V2 is not configured, the existing LQC Flow AMM V1 flow remains available.

Before requesting the wallet transaction, the UI shows a confirmation summary with the minimum received amount, selected strategy, indicative BNB network fee, and a warning when estimated price impact is 3% or higher. Price impact and network fee values are estimates, not execution guarantees.

Never commit private keys or `.env` files.

## Current limitations

This is an unaudited testnet MVP, not production-ready software. Router V2 now provides the adapter registry, best-quote execution core, native-BNB wrapping/unwrapping, ERC-20 split execution, and a Uniswap V2-compatible adapter; the browser and SDK calculate optimal split percentages off-chain. Network-specific router addresses still require testnet verification and allowlisting. Fee-on-transfer tokens, permit signatures, protocol-fee accounting, LQC fee conversion/burning, governance timelocks, pausability, price oracles, and the full chart-based trading interface are intentionally deferred.

Before any mainnet use, complete independent audits, invariant/fuzz testing, economic simulations, legal review, multisig/timelock setup, token and pool allowlisting decisions, monitoring, and a capped-liquidity testnet/pilot phase.
