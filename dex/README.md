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

Split execution rejects duplicate DEX identifiers. This prevents a caller from dividing one DEX allocation into repeated legs to bypass its configured per-DEX token cap.

The risk multisig may immediately reduce an existing DEX/token cap but cannot create a new cap, raise a cap, allow a token, or resume paused trading. Expansion remains restricted to timelocked governance.

Emergency-controller ownership changes use nomination and explicit acceptance, reducing the risk of transferring operational control to an incorrect or inaccessible address.

Deterministic model-based fuzz tests compare on-chain daily usage against an independent accounting model across valid and rejected multi-route transactions. Failed transactions must leave the usage counter unchanged.

Router 2.0 is intentionally protocol-neutral: every EVM DEX can be integrated through the same reviewed adapter interfaces and enabled or paused independently in the registry. A DEX is never treated as compatible until its protocol-specific quote and execution adapter, route validation, tests, and security review are complete. Non-EVM liquidity will be connected later through the cross-chain routing layer rather than unsafe direct assumptions.

## Commands

The GitHub Actions workflow at `.github/workflows/dex-ci.yml` performs a locked dependency install, compiles every Solidity source, and runs the complete DEX test suite for relevant pull requests and `main` branch changes. Reviewers should use the [`security test matrix`](docs/SECURITY_TEST_MATRIX.md), [`audit scope`](docs/AUDIT_SCOPE.md), and [`audit handoff`](docs/AUDIT_HANDOFF.md) together. These documents organize evidence; they are not an audit claim.

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
export PANCAKE_V3_ALLOWED_POOLS='[{"tokenA":"0x...","tokenB":"0x...","fee":2500}]'
npm run deploy:testnet
```

The default mock supplies and pool amounts are configurable environment values for testing only;
they do not define LQC mainnet supply, allocation, valuation, or launch liquidity.
The deployment transfers registry ownership to the timelock. `FACTORY_OWNER` becomes the governance
proposer and should be a reviewed multisig address. Emergency guardians may disable a route immediately,
but only a timelocked governance operation can re-enable or structurally change it.

The automated test suite also reproduces the complete bootstrap locally and verifies both pool
creation, Router 2.0 quoting, a capped smoke swap, and rejection when minimum-output protection fails.

After deployment, run the read-only real-address validator before any smoke swap. It refuses every
chain except BSC testnet `97`, checks deployed bytecode, verifies PancakeSwap V2/V3 Router-to-Factory
and WBNB links, and confirms LQC timelock ownership, emergency pause authority, executor, DEX count,
registry order, adapter addresses, active route status, Router/Emergency module linkage, and minimum
timelock delay. A deployment record now pins each registered adapter address for this comparison.

```bash
export BSC_TESTNET_RPC_URL="https://..."
export DEPLOYMENT_FILE="./deployments/bsc-testnet-97.json"
npm run validate:testnet
```

Generate a reproducible BscScan verification package from the validated deployment record:

```bash
npm run prepare:verification -- ./deployments/bsc-testnet-97.json
```

The generated package pins the recorded source revision, compiler settings, standard JSON input,
constructor data, and deployed addresses. Confirm it matches the exact reviewed commit before explorer
publication.

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
