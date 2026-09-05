# LQC Flow DEX — AMM MVP

This package implements the first testable smart-contract layer for **LQC Flow DEX** on EVM-compatible networks such as BNB Smart Chain.

## Included

- `LQCFlowFactory`: permissionless token-pair creation and two-step owner transfer
- `LQCFlowPair`: constant-product (`x*y=k`) pool and ERC-20 LP shares
- `LQCFlowRouter`: token/BNB liquidity add/remove, exact-input swaps, exact-output swaps, and multi-hop paths
- `LQCFlowQuoter`: compares up to 16 candidate routes and selects the highest-output viable path
- `LQCFlowRouterV2`: compares approved external-DEX adapters and executes the best token or native-BNB route
- `UniswapV2DEXAdapter`: integration layer for PancakeSwap V2, Biswap, and compatible routers
- Native BNB wrapping/unwrapping through the configured WBNB contract
- 0.30% swap fee retained in the pool for liquidity providers
- Minimum permanently locked liquidity
- Slippage bounds and transaction deadlines
- Pair-level reentrancy lock and safe ERC-20 transfers
- Local compilation plus AMM, route-selection, and security-boundary integration tests
- BSC testnet deployment script
- Static wallet-connected swap interface in `app/`

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

After deployment, configure the verified Router, WBNB, and LQC test-token addresses:

```bash
export ROUTER_ADDRESS="0x..."
export WBNB_ADDRESS="0x..."
export LQC_ADDRESS="0x..."
npm run configure:app
```

The interface remains visibly disabled until all three addresses are configured.

Never commit private keys or `.env` files.

## Current limitations

This is an unaudited testnet MVP, not production-ready software. Router V2 now provides the adapter registry, best-quote execution core, native-BNB wrapping/unwrapping, and a Uniswap V2-compatible adapter; network-specific router addresses still require testnet verification and allowlisting. Fee-on-transfer tokens, permit signatures, protocol-fee accounting, LQC fee conversion/burning, governance timelocks, pausability, price oracles, and the full chart-based trading interface are intentionally deferred.

Before any mainnet use, complete independent audits, invariant/fuzz testing, economic simulations, legal review, multisig/timelock setup, token and pool allowlisting decisions, monitoring, and a capped-liquidity testnet/pilot phase.
