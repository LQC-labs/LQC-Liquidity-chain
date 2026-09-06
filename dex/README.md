# LQC Flow DEX — AMM MVP

This package implements the first testable smart-contract layer for **LQC Flow DEX** on EVM-compatible networks such as BNB Smart Chain.

## Included

- `LQCFlowFactory`: permissionless token-pair creation and two-step owner transfer
- `LQCFlowPair`: constant-product (`x*y=k`) pool and ERC-20 LP shares
- `LQCFlowRouter`: token/BNB liquidity add/remove, exact-input swaps, exact-output swaps, and multi-hop paths
- `LQCFlowQuoter`: compares up to 16 candidate routes and selects the highest-output viable path
- `LQCFlowRouterV2`: compares approved external-DEX adapters and executes the best token or native-BNB route
- `LQCRouterTimelock`: delayed privileged execution designed to place Router V2 ownership behind an external multisig
- Router V2 split execution: divides one ERC-20 trade across up to 8 approved DEX routes using basis-point allocations
- Router V2 emergency pause: blocks every swap entry point while leaving route quotes available for inspection
- Router V2 token allowlist, per-trade maximum input, and UTC-day cumulative input cap across every swap entry point
- Read-only risk status for wallet interfaces; quotes remain inspectable while disallowed execution is blocked
- Pause-guardian separation: the guardian can stop swaps immediately, while only timelock ownership can resume them
- `sdk/route-optimizer.mjs`: discovers direct, one-hop, and two-hop routes across up to 16 DEX adapters and returns the best executable route
- `UniswapV2DEXAdapter`: integration layer for PancakeSwap V2, Biswap, and compatible routers
- Native BNB wrapping/unwrapping through the configured WBNB contract
- 0.30% swap fee retained in the pool for liquidity providers
- Minimum permanently locked liquidity
- Slippage bounds and transaction deadlines
- Pair-level reentrancy lock and safe ERC-20 transfers
- Local compilation plus AMM, route-selection, and security-boundary integration tests
- BSC testnet deployment script
- Responsive mobile-first market and wallet-connected swap interface in `app/`
- Clearly labelled deterministic testnet-demo candlestick, moving-average, and volume visualization
- Wallet-linked LQC balance panel and prominent BUY/SELL controls on mobile
- Optional GeckoTerminal OHLCV integration with validated pool configuration, bounded requests, timeout handling, and stale-data labelling
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
export TIMELOCK_ADMIN="0x..." # external multisig address
export PAUSE_GUARDIAN="0x..." # distinct operational security address
export TIMELOCK_DELAY_SECONDS="172800" # 48 hours; allowed range is 1 hour to 30 days
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

The adapter script verifies chain ID 97, Router V2 WBNB, PancakeSwap WBNB, and PancakeSwap Factory before deployment. When Router V2 is timelock-owned, set `ROUTER_TIMELOCK_ADDRESS`; the script schedules adapter enablement only if the deployer is the timelock admin, otherwise it prints the required governance action. Execution remains unavailable until the configured delay expires.

## Optimal route guidance

The route optimizer generates direct and connector-token paths, requests every configured DEX adapter quote in parallel, ignores unavailable pools, and ranks viable results by net output after pool fee, price impact, and an optional output-token-denominated gas estimate. It returns the selected adapter, full token path, expected and net output, slippage-adjusted minimum output, and ready-to-submit Router V2 arrays. The two-way split optimizer tests allocation steps across route pairs and returns the highest-net-output split plus Router V2 execution arrays. Quotes must be refreshed immediately before transaction submission.

After deployment, configure the verified Router, WBNB, and LQC test-token addresses:

```bash
export ROUTER_ADDRESS="0x..."
export WBNB_ADDRESS="0x..."
export LQC_ADDRESS="0x..."
export MARKET_POOL_ADDRESS="0x..." # verified LQC/WBNB pool; optional
export MARKET_NETWORK="bsc"
export MARKET_TOKEN_SIDE="base" # base or quote, matching LQC's side in the pool
npm run configure:app
```

The interface remains visibly disabled until all three addresses are configured.

For Router V2 mode, also configure `ROUTER_V2_ADDRESS` and `PANCAKE_ADAPTER_ADDRESS`. The UI refreshes quotes immediately before submission, automatically uses a two-way ERC-20 split when it improves output by more than 0.10%, and calls the appropriate split, token/token, BNB/token, or token/BNB Router V2 entry point. Native-BNB trades remain single-route because Router V2 split execution accepts ERC-20 inputs. When Router V2 is not configured, the existing LQC Flow AMM V1 flow remains available.

Before requesting the wallet transaction, the UI shows a confirmation summary with the minimum received amount, selected strategy, indicative BNB network fee, and a warning when estimated price impact is 3% or higher. Price impact and network fee values are estimates, not execution guarantees. With a verified market pool configured, the chart reads OHLCV data from GeckoTerminal, refreshes no more than once per minute, and labels stale observations. Without a pool—or when the feed fails—it shows deterministic demonstration data. Neither mode is a lending oracle, execution guarantee, token valuation, or trading signal.

The UI reads Router V2's on-chain pause state. When swaps are paused, quotes remain visible but BUY and SELL execution is disabled.

Router V2 also reads the configured token risk policy before enabling execution. Both input and output tokens must be allowed, the input must remain within its raw-token per-trade limit, and its cumulative input must remain within the current UTC-day cap. Risk-policy updates are owner-only and therefore follow the same timelock governance path when deployed as documented. USD-denominated limits must not be approximated on-chain without a reviewed oracle and decimal-normalization design.

Never commit private keys or `.env` files.

## Current limitations

This is an unaudited testnet MVP, not production-ready software. Router V2 now provides the adapter registry, best-quote execution core, native-BNB wrapping/unwrapping, ERC-20 split execution, function-level swap pausing, and a Uniswap V2-compatible adapter; the browser and SDK calculate optimal split percentages off-chain. Network-specific router addresses and the optional market-data pool still require testnet verification and allowlisting. Fee-on-transfer tokens, permit signatures, protocol-fee accounting, LQC fee conversion/burning, production-grade market-data redundancy, and price oracles are intentionally deferred. The governance timelock and chart-based interface are implemented locally, but neither has been independently audited or deployed for production.

Before any mainnet use, complete independent audits, invariant/fuzz testing, economic simulations, legal review, multisig/timelock setup, token and pool allowlisting decisions, monitoring, and a capped-liquidity testnet/pilot phase.
