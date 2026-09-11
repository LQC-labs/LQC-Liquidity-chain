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
- Fail-closed pending-swap recovery that binds the persisted quote sender, quote recipient, and settlement recipient to one valid account
- Cross-tab settlement recovery always reloads the latest persisted transaction, preventing stale timers from following a superseded speed-up hash
- Persisted recovery records are structurally rebound to the reviewed chain, quote and execution routers, transaction envelope, token pair, account, minimum output, and settlement kind before any RPC recovery begins
- Canonical submitted-transaction consensus verifies the exact sender, Router call data, value, gas envelope, and nonce across the configured RPC majority, including bounded same-call fee replacements, while isolating malformed minority responses; receipt and settlement acceptance is restricted to that same agreeing RPC set
- A single wallet RPC cannot discard a submitted trade after reporting a reverted receipt; the pending record remains locked until the configured RPC majority canonically confirms failure
- A wallet-reported cancellation releases the trade lock only after the configured RPC majority agrees on a successful, different transaction from the same sender and chain using the original nonce
- Pending cancellation hashes are stored with the original trade identity, so reloads continue canonical cancellation verification instead of losing the replacement trail
- Cancellation updates propagate across open tabs and the recovery explorer link follows the transaction currently being verified
- A terminal recovery clear also propagates across tabs without releasing a tab that is still independently verifying its own submitted transaction
- Cross-tab recovery decisions are isolated and behavior-tested so an external clear cannot hide recovery controls for a locally verified pending trade
- Wallet account, chain, and disconnect events invalidate in-flight signing context; superseded asynchronous connection attempts cannot restore a stale signer or Router session
- Wallet connection epochs are isolated and behavior-tested across repeated attempts, provider replacement, disconnect, and forged stale-version inputs
- The execution button is governed by a wallet-aware trade gate, so stale quote or recovery callbacks cannot re-enable trading after disconnect
- Quote sessions bind token pair, amount, slippage, and wallet context; late RPC responses cannot overwrite a newer market or re-enable its trade action
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
- Signed candle clients retain bounded per-market finality watermarks for the browser tab and reject
  cursor, finalized-block, or issuance-time rollback plus conflicting same-revision responses
- Live charts preserve the last verified view during indexer failures, expose loading, delayed, and
  offline states, retry with bounded exponential backoff, and recover immediately when connectivity returns
- Chart health reports verified round-trip latency: responses up to 1.5 seconds are healthy, slower
  responses are delayed, and offline state or three consecutive failures are interrupted
- The client also checks the signed issuance time, treats responses older than 15 seconds as delayed,
  and shows the last healthy refresh time separately for each exact market and timeframe
- The browser compares every signed finalized block with a bounded live BSC head lookup and reports
  synchronized, catching-up, stale, or unverifiable status without making chart availability depend on that RPC
- Browser block-head checks support one to five deployment-pinned HTTPS RPCs, require a configured-source
  majority within three blocks, isolate divergent sources, and use the conservative head of the winning cluster.
  The browser then requires the same configured-source majority to return an identical 32-byte hash for that
  exact block before reporting synchronization; conflicting forks or forged RPC responses fail closed. A source
  that fails transport, height-cluster, or canonical-hash checks three consecutive times is isolated for 60 seconds,
  then admitted only through a fresh health check without ever reducing the configured majority threshold. Bounded
  health state survives browser restarts only for the exact deployment fingerprint; records older than five minutes,
  expired quarantines, provider-count changes, and forged long isolation periods are discarded. Read-only Router
  quotes use only canonical height-and-hash participants, prefer the lowest measured latency, and fail over through
  the remaining canonical providers; no quote is shown before an RPC quorum is established. Every Router quote is
  evaluated at the same consensus-pinned block and must match exactly across a configured-source majority (DEX id,
  adapter, output amount, and priority), so a split or manipulated quote is rejected before trade preparation. The
  accepted quote is bound to that block number and hash for at most 10 seconds; immediately before wallet signing,
  the browser rechecks both the canonical hash and exact Router result with the full configured quorum policy. The
  same binding covers chain id, Quote Router address, ordered token pair, exact input amount, every encoded route,
  and signing slippage, preventing a valid quote from being replayed for modified trade parameters. The final plan
  additionally binds sender, recipient, exact execution Router, minimum output, deadline, and execution kind; those
  values are compared again after quote revalidation and immediately before opening the wallet signature request.
  The client then populates the exact transaction once, binds its chain id, destination, calldata, and native value,
  and sends that same immutable request to the signer; target substitution, calldata mutation, and value injection fail closed
- Native BNB settlement verification authenticates the reviewed Native Router event and reconciles its exact execution amounts
- Deterministic execution-proof fuzzing exercises varied route economics and tamper attempts reproducibly
- Dependency-free V8 coverage gate requires 100% Router SDK function coverage and reports executed ranges honestly
- Audit-surface drift gate classifies every state-changing entry point in the three critical Solidity contracts
- Adversarial integration tests prove malicious adapters and unauthorized callers cannot bypass critical Router, Risk, or Vault boundaries
- Malicious Strategy callback tests prove Vault allocation and recall remain atomic under reentrancy attempts
- Dishonest Strategy tests reject false deployment, withdrawal, token-balance, managed-asset, and debt reports
- Rebasing-token tests prove positive balance changes cannot inflate shares and negative idle-backing
  deficits halt deposits and withdrawals before first-mover extraction
- Strict ERC-20 return-data validation rejects false, short, and oversized responses atomically while
  retaining compatibility with empty-return and zero-first-approval tokens
- Hostile token tests fail closed on invalid balance responses and roll back transfer-callback
  reentrancy without changing Vault assets, shares, supply, or backing
- Vault Strategy allocation starts paused, and every Strategy change requires a paused, debt-free
  staging window followed by an explicit governance resume

New DEXs can be added through reviewed adapters without replacing the quote, optimizer, auto, or execution routers. The BSC testnet deployment script deploys and registers the LQC Flow adapter automatically and optionally registers PancakeSwap V2 or V3 when their reviewed addresses are supplied. Exact-input token and native BNB execution, oracle-validated gas-cost conversion, gas-cost-adjusted route selection, automatic split optimization, slippage-derived protection, atomic optimized execution, timelocked registry ownership, disable-only emergency control, token allowlisting, and staged transaction limits are now available. Live production feed configuration, final risk-committee parameter approval, multisig assignment, and production integrations remain pending.

Before the live Stage 2 preflight, run `npm run readiness:mvp`. It reports every missing BSC testnet MVP input in one pass—without printing the deployer key or configured addresses—covering the reviewed clean commit, role separation, pinned PancakeSwap V2/V3 endpoints, reviewed V3 pools, and the initially disabled Vault strategy.
The `npm run gate:stage2-predeploy` command now runs that readiness check first, so missing external inputs stop immediately before the full Stage 1 suite and dependency audit consume time.
Run `npm run preflight:public` as soon as RPC, WBNB, pinned PancakeSwap endpoints, and reviewed V3 pool descriptors are available. It verifies chain 97, deployed bytecode, and canonical V3 pool existence without accepting or requiring a deployer private key, governance address, or treasury role.

Router 2.0 is intentionally protocol-neutral: every EVM DEX can be integrated through the same reviewed adapter interfaces and enabled or paused independently in the registry. A DEX is never treated as compatible until its protocol-specific quote and execution adapter, route validation, tests, and security review are complete. Non-EVM liquidity will be connected later through the cross-chain routing layer rather than unsafe direct assumptions.

## Commands

```bash
npm install
npm test
```

Before preparing Stage 2, run the complete Stage 1 repository exit gate:

```bash
npm run gate:stage1
```

This repeats the browser syntax checks, compiles all Solidity sources, runs the complete security
suite, and enforces the Router SDK coverage baseline. It does not deploy contracts or authorize use
of real funds.

To deploy after compilation:

```bash
export BSC_TESTNET_RPC_URL="..."
export DEPLOYER_PRIVATE_KEY="..."
export WBNB_ADDRESS="0x..." # official WBNB for the selected BSC network
export EXPECTED_CHAIN_ID="97" # deployment safety check; defaults to BSC testnet
export FACTORY_OWNER="0x..." # required reviewed testnet governance/multisig address
export RISK_ADMIN="0x..." # separate reviewed testnet risk multisig address
export GUARDIAN_ADDRESS="0x..." # separate reviewed emergency multisig address
export TREASURY_ADDRESS="0x..." # separate reviewed treasury multisig address
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

After deployment evidence is produced, generate the unsigned Governance Safe action that activates
the reviewed emergency Guardian:

```bash
npm run prepare:roles -- ./deployments/bsc-testnet-97.json
```

The output validates all four recorded Safe policies, their exact role addresses, role separation,
the reviewed source revision, and a deterministic deployment fingerprint, then encodes
`EmergencyController.setGuardian(guardian, true)`. It never signs or sends a transaction and marks
the Treasury as recorded but unfunded. Save and independently verify the bundle before Safe review:

```bash
npm run prepare:roles -- ./deployments/bsc-testnet-97.json > ./deployments/role-activation.local.json
npm run verify:role-activation -- ./deployments/role-activation.local.json ./deployments/bsc-testnet-97.json
```

The verifier recomputes the source-bound deployment fingerprint, action calldata, and SHA-256 bundle
digest and rejects any modified field.

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

Before `deploy:testnet`, run `npm run gate:stage2-predeploy`. This single fail-closed command first
runs the complete Stage 1 repository exit gate, then audits production dependencies at high severity,
and finally runs the live BSC testnet preflight. It never signs or broadcasts a transaction.

Every confirmed contract deployment is immediately recorded in
`deployments/bsc-testnet-97.checkpoint.local.json` (or `DEPLOYMENT_CHECKPOINT_FILE`). A retry with the
same chain, deployer, constructor arguments, and compiled bytecode verifies the recorded on-chain
code and reuses that contract instead of paying to deploy it again. Any mismatch stops the run.
Checkpoint files are gitignored and never contain private keys.
Registry configuration, DEX registration, token/DEX caps, and ownership-transfer operations are also
checkpointed. Transaction hashes are saved before confirmation; retries inspect pending receipts and
skip only operations proven successful on-chain. Missing or reverted receipts stop the deployment.
Previously confirmed operations are also rechecked against the canonical receipt on every retry;
missing receipts or changed block evidence stop recovery instead of trusting stale local state. An unresolved
submitted swap never expires merely because time passed: the browser remains fail-closed until independent RPCs
canonically confirm either success or failure, preventing a delayed transaction from being duplicated after reload.
A malformed, corrupted, future-dated, wrong-version, or wrong-deployment pending record also locks trading and shows
explicit recovery guidance instead of being silently discarded. Existing tabs listen for new pending records written
by another tab, invalidate any stale pre-sign wallet context, lock their controls, and join canonical recovery without
requiring a reload.
Browsers without the Web Locks API cannot submit swaps: the UI fails closed rather than falling back to an unsafe
same-tab-only lock that could permit duplicate signatures from multiple tabs.
Immediately before requesting a swap signature, the app reserves, reads back, and removes a full-sized recovery
record. If durable browser storage is unavailable or quota-blocked, execution stops before broadcast and provides
localized remediation guidance.
The recovery store is isolated from the UI and covered by executable tests for bigint round trips, corruption,
deployment mismatch, future timestamps, quota rejection, altered readback, and failed reservation removal.
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

After deployment, generate the unsigned Governance Safe action for emergency Guardian activation:

```bash
npm run prepare:role-activation -- ./deployments/bsc-testnet-97.json
```

The generator rechecks chain 97, full role separation, and the recorded 4-of-7 / 3-of-5 Safe
policies before encoding `setGuardian(address,true)`. It records Treasury as unfunded and never signs,
sends, or funds a transaction.

After deployment, run the read-only real-address validator before any smoke swap. It refuses every
chain except BSC testnet `97`, checks deployed bytecode, verifies PancakeSwap V2/V3 Router-to-Factory
and WBNB links, and confirms LQC timelock ownership, emergency pause authority, executor, DEX count,
registry order, adapter addresses, active route status, Router/Emergency module linkage, and minimum
timelock delay. It also refuses smoke-test readiness unless the reviewed Guardian Safe is active
on-chain and every operational role remains separated. For PancakeSwap V3 it matches the recorded maximum hop count, canonical fee-tier
subset, and every reviewed pool against the deployed adapter allowlist. A deployment record pins each
registered adapter address and V3 policy for this comparison. The gas-cost oracle is also transferred
to the timelock during bootstrap; validation rejects deployer-owned or wrong-WBNB oracle instances.

```bash
export BSC_TESTNET_RPC_URL="https://..."
export BSC_TESTNET_RPC_URLS="https://independent-rpc-2.example,https://independent-rpc-3.example"
export CANDLE_SIGNING_PRIVATE_KEY="<dedicated indexer signing key; never commit>"
export CANDLE_REQUESTS_PER_MINUTE="120"
export CANDLE_MAX_CONCURRENT="32"
export METRICS_BEARER_TOKEN="<at least 32 random characters>"
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

The JSON report verifies block freshness and the strict deployment configuration, fails closed with
independent-provider confirmation steps when RPC data is stale, reports emergency
pause and pending-ownership states, and checks that execution, native, and automatic routers retain
no BNB, LQC, mock-USDT, or WBNB custody. It also compares both Safe owner sets and thresholds with
the deployment record: a weakened policy is critical, while any other signer or threshold change
requires governance review. The report emits deterministic incident-response sequences for Safe
policy findings, pending ownership transfers, active emergency swap pauses, and Vault operation
pauses, but never signs or sends a pause, ownership,
signer-change, or recovery transaction. Emergency
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

The generated UI can scale beyond the bootstrap BNB/WBNB/LQC/Mock-USDT set through the deployment
record's optional `reviewedTokens` array. Every added token must have a valid address, bounded symbol,
name and decimals, an explicit `riskApproved: true` marker, and one or more `routeDexIds` that match
registered DEX adapters. The browser sends valid route data only to the intersection of DEX routes
approved for both selected tokens and the exact unordered token pair recorded in `reviewedPairs`;
all other adapters receive an invalid isolated probe and cannot be
selected for execution. Configuration generation rejects duplicate symbols
or addresses, malformed metadata, unapproved entries, and lists above 500 tokens. This keeps token
search convenient without turning it into an unsafe arbitrary-contract importer.
The Markets dialog and both token selectors apply the same exact-pair registry before selection, so
users see only assets that have a reviewed quote market with the current counter-token. Unsupported
pair errors are prevented before an RPC quote or wallet approval is requested.

Before signing, canonical RPC participants simulate the exact populated transaction. A majority of
all configured sources must return the same call result, agreeing gas estimates must stay within 20%
of each other and below the reviewed route ceiling, and the bounded estimate is attached as an
immutable gas limit. Missing quorum, divergent execution, or abnormal gas fails closed before the
wallet receives the request.
The connected wallet's pending nonce and one unambiguous fee model (legacy or EIP-1559) are then
bound into the same immutable request. The pending nonce is checked once more immediately before
submission, so a parallel transaction or any mutation of the target, calldata, value, gas, fee, or
nonce stops the swap before signing.
Fees are sourced from the canonical RPC participants rather than trusted to one wallet endpoint. A
configured-source majority must agree on the legacy or EIP-1559 model, each fee component must remain
within a 20% spread, and the highest agreeing value is bound conservatively. The interface replaces
its preliminary estimate with the resulting maximum BNB network cost before opening the wallet.
After submission, the UI does not treat the wallet provider's receipt as final evidence. Canonical
RPC participants independently wait for three confirmations and must form a configured-source
majority on the transaction hash, successful status, block number, and block hash. A reorg, failed
receipt, insufficient confirmation, timeout, or split view prevents the UI from reporting success.
The same agreeing receipts must also prove the received amount. ERC-20 outputs are summed only from
valid `Transfer` logs for the bound output token and recipient, while native BNB outputs require one
exact `NativeSwapExecuted` event from the reviewed Native Router with the bound input token and
amount. A configured-source majority must decode the same output at or above the signed minimum.
Each verified swap is reduced to tamper-evident execution evidence that binds the deployment,
canonical quote, approved route request, final execution policy, immutable wallet transaction, and
confirmed settlement. The browser retains at most ten valid records for the exact deployment and
shows the latest transaction link, actual received amount, and evidence hash in Trade Details.
Users can open a bounded history dialog for all ten retained records, follow each transaction to the
configured BSC testnet explorer, and download an individual human-readable JSON evidence file. The
history and export paths re-run evidence verification and never render untrusted record HTML.
The trading client also holds a single in-flight submission lock from pre-sign checks through
settlement verification, so repeated clicks or concurrent UI refreshes cannot submit the same order
twice. The action remains visibly busy and disabled until the attempt succeeds or fails.
Each attempt also snapshots the connected account, chain, and wallet-context revision. Account or
network changes invalidate the attempt, and the client rechecks the live signer and chain before
every approval and final Swap signature.
If a wallet speeds up a pending Swap, the client follows only a successful replacement receipt and
uses the replacement transaction hash for multi-RPC settlement verification and evidence. Cancelled,
failed, or malformed replacements fail closed and are never recorded as completed trades.
While a signature or settlement is pending, the amount, slippage, token, market, direction, balance
preset, and route-affecting controls are disabled together. Open token or market selectors close at
submission start, preventing the visible order from diverging from the transaction being verified.
After a transaction hash exists, an RPC or settlement-consensus failure keeps the order controls
locked and shows a do-not-resubmit warning with the hash prefix. The lock clears automatically only
after verified evidence is saved, a replacement is explicitly cancelled, or an on-chain receipt
proves that the submitted transaction failed.
The Trade Details explorer link appears as soon as the wallet returns a valid transaction hash and
shows `확인 중 / 검증 대기` until settlement evidence is complete. A successful speed-up updates the
link to the replacement hash; a confirmed cancellation or failure restores the latest verified trade.
The submitted hash, wallet, chain, and deployment fingerprint are also kept in deployment-scoped
browser storage. Reloading the page therefore restores the explorer link and keeps every order control
locked until the submitted transaction has a terminal failure or complete verified settlement evidence.
When the original wallet reconnects, every configured browser RPC is queried independently. The lock
is cleared automatically only when a canonical majority reports the same failed receipt with at least
three confirmations; pending, successful-but-unverified, conflicting, and unavailable results stay locked.
Version 2 pending records also retain the proof-bound execution plan and settlement decoder context with
lossless integer encoding. If the same successful receipt, canonical block, and decoded output reach RPC
majority after a reload, the app rebuilds and verifies the execution evidence before unlocking trading.
Browsers that support the Web Locks API serialize swap submission by deployment and connected wallet.
The deployment-scoped pending record is checked again inside the lock, and storage events immediately
mirror a submitted-transaction lock into other open tabs. A clearing event still triggers independent
RPC reconciliation in each tab instead of trusting another tab to unlock trading.
Successful reload recovery also fetches the mined transaction independently from each RPC. Evidence is
completed only when the transaction hash, sender, chain, Router target, calldata, value, nonce, gas limit,
and legacy or EIP-1559 fee envelope exactly match the proof-bound transaction prepared before signing.
Wallet speed-up replacements must preserve the chain, Router call, value, gas limit, nonce, and fee model.
Only non-decreasing legacy or EIP-1559 fees capped at five times the prepared envelope are accepted, and
the replacement transaction becomes the new persisted proof binding before settlement evidence is built.
Every submitted or replacement hash is read back byte-for-byte from durable storage. A conflicting
pending plan is rejected instead of overwritten, and terminal settlement clears only the exact hash it
verified, preventing an older tab from deleting a newer recovery record.

The generated configuration derives every Router, token, DEX id, and adapter from that single record
and includes a deterministic deployment fingerprint. Any optional legacy address override must match
the record exactly or generation fails, preventing mixed-deployment addresses from reaching the UI.

The interface remains visibly disabled until all required Router 2.0 addresses are configured.

Historical candles use a separate, read-only indexer boundary because a spot Router quote cannot
prove past OHLCV values. Set `candleDataUrl` in the generated app configuration to an endpoint that
accepts `chainId`, `base`, `quote`, `timeframe`, and `limit` query parameters and returns
`{ "candles": [{ "time", "open", "high", "low", "close", "volume" }] }`. The browser rejects
malformed OHLCV rows, sorts and deduplicates timestamps, caps history at 300 candles, discards stale
responses after market or interval changes, and labels the chart as verified history only after a
valid response. If the endpoint is absent or fails, the UI remains honest and displays the clearly
labelled example chart; it never presents a spot quote as historical market data.

The testnet LQC Flow event indexer can now provide that endpoint. It reads only pool addresses pinned
in the completed deployment record, converts exact on-chain `Swap` events into both token-pair
orientations, aggregates deterministic OHLCV buckets, caps retained trades and API results, and
rejects every non-chain-97, unknown-pool, invalid-address, or unsupported-interval request. It indexes
only blocks behind the configurable finality boundary (12 blocks by default). The UI independently
requests 1-hour candles for complete 24-hour change, high, low, and base-volume statistics and leaves
those fields blank rather than extrapolating when a full window is unavailable.

```bash
export BSC_TESTNET_RPC_URL="https://..."
export DEPLOYMENT_FILE="./deployments/bsc-testnet-97.json"
export START_BLOCK="<reviewed deployment block>"
export CORS_ORIGIN="https://lqc-labs.github.io"
npm run serve:candles
```

When redundant URLs are configured, every sync requires a majority of independent RPC sources to
agree on the same finalized block hash. An unavailable primary automatically fails over to the first
healthy source in the canonical majority; missing quorum or conflicting hashes stop candle updates.
Every candle response is bound to chain, market, timeframe, finalized cursor, and a 30-second expiry
with an EIP-191 signature. Record the dedicated signer's public address as
`ui.candleSignerAddress`; the browser rejects expired, substituted, or modified responses.
The service applies per-client request limits, a bounded concurrent-work ceiling, short signed-response
caching, and ETags. Forwarded client addresses are ignored unless the deployment explicitly sets
`TRUST_PROXY=1` behind a trusted reverse proxy.
An authenticated `/metrics` endpoint exposes low-cardinality Prometheus counters and gauges for
requests, rate limits, overload rejection, cache efficiency, signed responses, sync failures, reorg
recovery, index lag, and RPC quorum health. It never labels metrics with wallet addresses or client
IP addresses. The endpoint remains disabled when `METRICS_BEARER_TOKEN` is unset.
Deploy this process behind HTTPS and set the deployment record's `ui.candleDataUrl` to its
`/candles` URL before running `npm run configure:app`. The indexer atomically persists its finalized
cursor, block-hash anchors, and Swap-log positions, then detects chain reorganizations and rolls back
orphaned trades before rebuilding candles. `GET /health` reports operational state and `GET /ready`
returns HTTP 503 until finalized indexing is fresh and within the configured lag policy.

Set `CANDLE_INDEXER_HEALTH_URL` to the deployed `/ready` endpoint when running
`npm run monitor:testnet`. The monitoring report fails historical candle publication closed when the
indexer is unavailable, and emits a time-bounded warning after a recovered reorg. It never pauses or
resumes swaps automatically because Router execution is independently validated. Redundant RPC
operation and an external alert delivery service remain required before any mainnet pilot.

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
