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

This is an unaudited testnet MVP, not production-ready software. Fee-on-transfer tokens, permit signatures, protocol-fee accounting, LQC fee conversion/burning, governance timelocks, pausability, price oracles, Router 2.0 cross-DEX aggregation, and the web trading interface are intentionally deferred.

Before any mainnet use, complete independent audits, invariant/fuzz testing, economic simulations, legal review, multisig/timelock setup, token and pool allowlisting decisions, monitoring, and a capped-liquidity testnet/pilot phase.
