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
- Deterministic stateful AMM invariant tests covering reserve accounting, non-decreasing constant
  product, router dust balances, and permanently locked minimum liquidity
- Sampled Router 2.0 split invariants covering exact allocation/output totals, one-to-four-route caps,
  gas-cost deductions, inactive legs, and invalid part/route bounds
- Atomic split rollback tests proving that a later adapter failure restores user balances, pool
  reserves, and zero Router/adapter custody even after an earlier leg was executable
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
- \`PancakeV3ExecutionAdapter\`: executes only reviewed V3 fee tiers and token-pair pools, caps paths at three hops, and applies deadline, exact-approval, and minimum-output protection
- \`LQCExecutionRouter\`: executes token exact-input swaps only through enabled registry adapters, with minimum-output, deadline, recipient balance verification, exact temporary approvals, and reentrancy protection
- Automatic best-route execution compares every enabled execution adapter, isolates failed routes, applies caller-supplied gas estimates denominated in the output token, and uses deterministic registry priority for ties
- Atomic split execution can divide one order across two to four reviewed routes, enforcing exact input allocation plus per-route and aggregate minimum-output protection
- \`LQCSplitOptimizer\`: read-only incremental optimizer that distributes an order across every enabled execution adapter according to marginal output, price impact, route cost, and deterministic priority
- \`LQCAutoRouter\`: converts a capped optimizer result into a single-route or two-to-four-route atomic swap and derives route-level minimum outputs from user slippage tolerance
- \`LQCGasCostOracle\`: converts estimated BNB gas into output-token units only after primary/secondary price freshness and deviation checks
- \`LQCTimelockController\`: delays structural registry changes behind a governance proposer and review window
- \`LQCEmergencyController\`: gives guardians immediate DEX-specific or all-swap pause authority while every recovery remains governance-only
- \`LQCRiskRegistry\`: enforces token allowlisting plus per-DEX, per-transaction, and UTC-day input caps; the risk multisig can only reduce limits
- \`LQCNativeRouter\`: safely wraps and unwraps BNB around protected Router 2.0 token execution without retaining user balances

New DEXs can be added through reviewed adapters without replacing the quote, optimizer, auto, or execution routers. The BSC testnet deployment script deploys and registers the LQC Flow adapter automatically and optionally registers PancakeSwap V2 or V3 when their reviewed addresses are supplied. Exact-input token and native BNB execution, oracle-validated gas-cost conversion, gas-cost-adjusted route selection, automatic split optimization, slippage-derived protection, atomic optimized execution, timelocked registry ownership, disable-only emergency control, token allowlisting, and staged transaction limits are now available. Live production feed configuration, final risk-committee parameter approval, multisig assignment, and production integrations remain pending.

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
export PANCAKE_V3_QUOTER_ADDRESS="0x..." # optional; set together with the V3 router
export PANCAKE_V3_ROUTER_ADDRESS="0x..." # optional; token-to-token execution
export PANCAKE_V3_ALLOWED_FEE_TIERS='[500,2500]' # reviewed canonical tiers only
export PANCAKE_V3_ALLOWED_POOLS='[{"tokenA":"0x...","tokenB":"0x...","fee":2500}]'
export PANCAKE_V3_MAX_HOPS="2" # deployment-specific ceiling; allowed range 1-3
npm run deploy:testnet
```

The default mock supplies and pool amounts are configurable environment values for testing only;
they do not define LQC mainnet supply, allocation, valuation, or launch liquidity.
The deployment transfers registry ownership to the timelock. `FACTORY_OWNER` becomes the governance
proposer and should be a reviewed multisig address. Emergency guardians may disable a route immediately,
but only a timelocked governance operation can re-enable or structurally change it.

The automated test suite also reproduces the complete bootstrap locally and verifies both pool
creation, exact initial-liquidity approvals with no residual Router allowance, Router 2.0 quoting,
a capped smoke swap, and rejection when minimum-output protection fails.

After deployment, run the read-only real-address validator before any smoke swap. It refuses every
chain except BSC testnet `97`, checks deployed bytecode, verifies PancakeSwap V2/V3 Router-to-Factory
and WBNB links, and confirms LQC timelock ownership, emergency pause authority, executor, DEX count,
registry order, adapter addresses, active route status, Router/Emergency module linkage, and minimum
timelock delay. For PancakeSwap V3 it also matches the recorded maximum hop count, canonical fee-tier
subset, and every reviewed pool against the deployed adapter allowlist. A deployment record pins each
registered adapter address and V3 policy for this comparison. The gas-cost oracle is also transferred
to the timelock during bootstrap; validation rejects deployer-owned or wrong-WBNB oracle instances.

```bash
export BSC_TESTNET_RPC_URL="https://..."
export DEPLOYMENT_FILE="./deployments/bsc-testnet-97.json"
npm run validate:testnet
```

To probe reviewed LQC Flow and PancakeSwap V2/V3 routes without sending a transaction, copy the
route-probe example and replace its DEX ids, token addresses, raw input amount, path, and V3 fees.
The script ABI-encodes V2/LQC Flow paths and packed-encodes V3 paths automatically. Before quoting,
it confirms path endpoints and restricts V3 routes to the deployment record's fee tiers, pool
allowlist, and maximum hop count. It then repeats the complete chain/address/governance/V3-policy
validation and refuses non-BSC-testnet networks, disabled DEXes, adapter mismatches, malformed probes,
duplicate probes, and zero quotes.

```bash
export BSC_TESTNET_RPC_URL="https://..."
export DEPLOYMENT_FILE="./deployments/bsc-testnet-97.json"
cp ./docs/bsc-testnet-route-probes.example.json ./deployments/bsc-testnet-route-probes.local.json
export ROUTE_PROBES_FILE="./deployments/bsc-testnet-route-probes.local.json"
npm run smoke:testnet
```

Transaction mode is opt-in. It requires a runtime-only key, caps every raw input amount, checks the
swap with gas estimation, proves expired and impossible-minimum-output calls reject, uses an exact
token approval, clears pre-existing and failure-path wallet allowances, and verifies that the Router
and adapter retain neither input/output token balances nor execution allowance.

```bash
export EXECUTE_SMOKE_SWAP="true"
export DEPLOYER_PRIVATE_KEY="..." # never store this in a file or commit it
export SMOKE_MAX_INPUT_RAW="1000000000000000000"
export SMOKE_MIN_OUTPUT_BPS="9900"
npm run smoke:testnet
```

After deployment, configure the verified Router, WBNB, and LQC test-token addresses:

```bash
export ROUTER_ADDRESS="0x..."
export QUOTE_ROUTER_ADDRESS="0x..."
export EXECUTION_ROUTER_ADDRESS="0x..."
export NATIVE_ROUTER_ADDRESS="0x..."
export SPLIT_OPTIMIZER_ADDRESS="0x..."
export AUTO_ROUTER_ADDRESS="0x..."
export GAS_COST_ORACLE_ADDRESS="0x..."
export WBNB_ADDRESS="0x..."
export LQC_ADDRESS="0x..."
export REGISTERED_DEXES='[{"id":"0x...","name":"LQC Flow"},{"id":"0x...","name":"PancakeSwap V2"}]'
npm run configure:app
```

The interface remains visibly disabled until all required Router 2.0 addresses are configured.

Never commit private keys or `.env` files.

## Current limitations

This is an unaudited testnet MVP, not production-ready software. Fee-on-transfer tokens, permit signatures, protocol-fee accounting, LQC fee conversion/burning, production oracle feeds, and audited production integrations are intentionally deferred.

Before any mainnet use, complete independent audits, invariant/fuzz testing, economic simulations, legal review, multisig/timelock setup, token and pool allowlisting decisions, monitoring, and a capped-liquidity testnet/pilot phase.
