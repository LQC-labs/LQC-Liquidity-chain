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
- `LQCLiquidityVault` V1 with exact-asset accounting, permanently locked initial shares,
  donation-resistant share pricing, deposit caps, guardian deposit pause, and two-step ownership
- Strategy Adapter V1 with vault/asset binding, separate strategy administration, absolute exposure
  caps, bounded loss recognition, donation-resistant allocation accounting, pause controls, and a
  shutdown-only governance emergency recall

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
- End-to-end emergency drill coverage proves swaps stop immediately and cannot resume until both
  the Risk Registry and reviewed DEX route are restored through the configured timelock
- \`LQCRiskRegistry\`: enforces token allowlisting plus per-DEX, per-transaction, and UTC-day input caps; the risk multisig can only reduce limits
- \`LQCNativeRouter\`: safely wraps and unwraps BNB around protected Router 2.0 token execution without retaining user balances
- Proof of Best Execution receipts record and hash why a gas-adjusted single or split route was selected
- Proof-to-Settlement receipts bind that route decision to successful transaction, block, recipient, and actual-output evidence
- Canonical settlement verification rechecks RPC receipts, block finality, reorg safety, and ERC-20 output transfer totals
- Native BNB settlement verification authenticates the reviewed Native Router event and reconciles its exact execution amounts
- Deterministic execution-proof fuzzing exercises varied route economics and tamper attempts reproducibly
- Dependency-free V8 coverage gate requires 100% Router SDK function coverage and reports executed ranges honestly
- Audit-surface drift gate classifies every state-changing entry point in the three critical Solidity contracts
- Adversarial integration tests prove malicious adapters and unauthorized callers cannot bypass critical Router, Risk, or Vault boundaries
- Malicious Strategy callback tests prove Vault allocation and recall remain atomic under reentrancy attempts
- Dishonest Strategy tests reject false deployment, withdrawal, token-balance, managed-asset, and debt reports

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
export FACTORY_OWNER="0x..." # required reviewed testnet governance/multisig address
export RISK_ADMIN="0x..." # separate reviewed testnet risk multisig address
export GOVERNANCE_MIN_OWNERS="7"
export GOVERNANCE_MIN_THRESHOLD="4"
export RISK_MIN_OWNERS="5"
export RISK_MIN_THRESHOLD="3"
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

`deploy:testnet` runs a non-transactional preflight first. It refuses non-chain-97 RPCs, missing or
unsafe governance settings, timelocks outside 1 hour to 7 days, invalid daily/transaction limits,
liquidity above minted test supply, insufficient test BNB, unpinned PancakeSwap endpoints, and
configured addresses without BSC-testnet bytecode. The deployer must retain at least 0.5 tBNB by
default above initial liquidity for deployment gas, configurable through `MIN_DEPLOYER_TBNB_RESERVE`.
`SOURCE_COMMIT` must be the full reviewed commit SHA, must equal the checked-out Git commit, and the
worktree must be clean. Both preflight and the transaction-producing script enforce this binding.
The governance owner must expose the Safe multisig interface and satisfy a 4-of-7 minimum by default;
the separate risk administrator must satisfy a 3-of-5 minimum. The preflight reads both owner lists
and thresholds on-chain, rejects duplicate or zero signers, and records the verified policy in its
result. Temporary testnet exceptions
require explicit runtime-only `ALLOW_DEPLOYER_AS_OWNER=true` and/or `ALLOW_EOA_OWNER=true` opt-ins.

Every confirmed contract deployment is immediately recorded in
`deployments/bsc-testnet-97.checkpoint.local.json` (or `DEPLOYMENT_CHECKPOINT_FILE`). A retry with the
same chain, deployer, constructor arguments, and compiled bytecode verifies the recorded on-chain
code and reuses that contract instead of paying to deploy it again. Any mismatch stops the run.
Checkpoint files are gitignored and never contain private keys.
Registry configuration, DEX registration, token/DEX caps, and ownership-transfer operations are also
checkpointed. Transaction hashes are saved before confirmation; retries inspect pending receipts and
skip only operations proven successful on-chain. Missing or reverted receipts stop the deployment.
Previously confirmed operations are also rechecked against the canonical receipt on every retry;
missing receipts or changed block evidence stop recovery instead of trusting stale local state.
Each operation is bound to a hash of its addresses, limits, amounts, and other settings, so a retry
cannot silently reuse a successful transaction from a different deployment configuration. Test-token
minting, exact approvals, and both initial-liquidity transactions are covered by the same recovery flow.

The default mock supplies and pool amounts are configurable environment values for testing only;
they do not define LQC mainnet supply, allocation, valuation, or launch liquidity.
The deployment transfers registry ownership to the timelock. `FACTORY_OWNER` becomes the governance
proposer and should be a reviewed multisig address. Emergency guardians may disable a route immediately,
but only a timelocked governance operation can re-enable or structurally change it.
`RISK_ADMIN` is assigned directly to the Risk Registry and may only reduce existing limits or pause;
the preflight rejects a shared governance/risk address unless a testnet-only override is explicit.

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

Generate a read-only operational health report after deployment:

```bash
export BSC_TESTNET_RPC_URL="https://..."
export DEPLOYMENT_FILE="./deployments/bsc-testnet-97.json"
npm run monitor:testnet
```

Convert a completed emergency exercise record into a deterministic audit-evidence report:

```bash
npm run report:emergency-drill -- ./deployments/emergency-drill-input.local.json
```

The generator requires the complete eight-step pause-and-recovery sequence, chain 97, the reviewed
source revision, chronological timestamps, transaction hashes or read-only revert evidence, and the
full configured timelock delay. It emits a SHA-256 digest and refuses incomplete or failed drills.

Combine the deployment, latest monitoring result, and drill report into one review manifest:

```bash
npm run package:review-evidence -- <deployment.json> <monitoring.json> <drill.json> [external-evidence.json]
```

The package refuses mixed networks, commits, or deployment fingerprints and requires HEALTHY
monitoring. Missing explorer verification, independent audit, or secure legal/KYB references remain
explicit pending gates; repository evidence alone is never reported as full listing approval.

Render the verified package as a reviewer-readable Markdown summary:

```bash
npm run render:review-summary -- <review-evidence-package.json>
```

The renderer verifies the package digest before showing its baseline, evidence status, drill
reference, and outstanding external gates. It does not convert an incomplete package into an
approval claim.

Generate the JSON package, Markdown summary, and cross-file digest manifest in one operation:

```bash
npm run build:review-bundle -- <deployment.json> <monitoring.json> <drill.json> <empty-output-dir> [external-evidence.json]
```

The command writes all three outputs only after validation succeeds. It refuses to overwrite an
existing evidence bundle, preserving the original review record.

The JSON report verifies block freshness and the strict deployment configuration, reports emergency
pause and pending-ownership states, and checks that execution, native, and automatic routers retain
no BNB, LQC, mock-USDT, or WBNB custody. It also compares both Safe owner sets and thresholds with
the deployment record: a weakened policy is critical, while any other signer or threshold change
requires governance review. The report emits a deterministic incident-response sequence for Safe
policy findings, but never signs or sends a pause, signer-change, or recovery transaction. Emergency
pause requires the guardian multisig; recovery remains governance-approved and timelocked. A critical result exits with status `2` for CI/monitoring
integration. This operational evidence does not replace an independent audit.

Generate a reproducible BscScan source-verification package from the validated deployment record:

```bash
npm run prepare:verification -- ./deployments/bsc-testnet-97.json
```

The package pins the recorded source revision, compiler settings, standard JSON input, constructor
data, and deployed addresses. Confirm that it matches the reviewed commit before explorer publication.

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

After deployment, generate the UI configuration directly from the verified deployment record:

```bash
export DEPLOYMENT_FILE="./deployments/bsc-testnet-97.json"
npm run configure:app
```

The generated configuration derives every Router, token, DEX id, and adapter from that single record
and includes a deterministic deployment fingerprint. Any optional legacy address override must match
the record exactly or generation fails, preventing mixed-deployment addresses from reaching the UI.

The interface remains visibly disabled until all required Router 2.0 addresses are configured.

Never commit private keys or `.env` files.

## Gasless policy foundation

The first Gasless safety boundary is available in `contracts/gasless/LQCGaslessPolicy.sol`. It
records eligibility and consumes sponsorship quotas for a future BSC testnet paymaster or signed
relay. It enforces an expected chain, approved targets and tokens, a minimum oracle-derived notional,
insufficient user native gas, a per-transaction gas cap, a maximum of five sponsored transactions
per wallet per UTC day, a protocol-wide daily budget, and guardian pause with governance-only
recovery.

This policy does not relay a transaction, verify a user operation, reimburse a bundler, custody
assets, or provide sponsorship funds. Those components, stablecoin cost recovery, oracle integration,
abuse controls, monitoring, deployment, and an independent audit remain pending. See
[`GASLESS_POLICY.md`](docs/GASLESS_POLICY.md).

## Current limitations

This is an unaudited testnet MVP, not production-ready software. Fee-on-transfer tokens, permit signatures, protocol-fee accounting, LQC fee conversion/burning, production oracle feeds, and audited production integrations are intentionally deferred.

Before any mainnet use, complete independent audits, invariant/fuzz testing, economic simulations, legal review, multisig/timelock setup, token and pool allowlisting decisions, monitoring, and a capped-liquidity testnet/pilot phase.
