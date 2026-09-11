# LQC DEX BSC Testnet Deployment Checklist

Status: pre-deployment review. This checklist is for BSC testnet chain `97` only. It does not
authorize mainnet deployment or use of real user funds.

## 1. Required roles and wallets

- [ ] Create a Protocol Governance Safe meeting the default 4-of-7 minimum policy.
- [ ] Create separate Risk, Emergency Guardian, and Treasury Safes meeting the default 3-of-5 minimum policy.
- [ ] Record signer names and wallet addresses in the private governance register.
- [ ] Verify every signer can access, review, and sign a test Safe transaction.
- [ ] Use the deployed Protocol Governance Safe address as `FACTORY_OWNER`.
- [ ] Use the deployed Risk Safe address as `RISK_ADMIN`.
- [ ] Set `GUARDIAN_ADDRESS` and `TREASURY_ADDRESS` to their reviewed Safe addresses.
- [ ] Keep the deployer separate from all four operational roles.
- [ ] Never paste, commit, email, or include the deployer private key in screenshots or documents.

The deployment script assigns protocol ownership and the timelock proposer to `FACTORY_OWNER`, while
`RISK_ADMIN` receives only limit-reduction and pause authority. Guardian and Treasury addresses are
recorded as reviewed operational roles for the later governance activation and funding steps.
Preflight rejects shared addresses by default so role separation is established before deployment.
For the first testnet deployment, the Risk Safe is also recorded as the Vault pause and strategy
administrator. Vault ownership is transferred to the timelock, and the strategy allocation cap
defaults to zero until governance explicitly approves a bounded exercise.

## 2. Network and external-contract verification

Before deployment, place only the five public addresses and reviewed Safe threshold metadata in a
local JSON file, then run `npm run prepare:role-review -- <public-role-addresses.json>`. The command
requires a separate deployer, Governance, Risk, Guardian, and Treasury address; enforces the approved
4-of-7 and 3-of-5 policies; rejects secret-bearing fields; and prints a deterministic review
fingerprint. It does not query the chain, sign, save, or broadcast anything. On-chain Safe bytecode,
owners, and thresholds must still pass the Stage 2 predeployment and post-deployment validators.

- [ ] RPC returns BSC testnet chain id `97`.
- [ ] Use the official BSC testnet WBNB address and independently verify its bytecode.
- [ ] Pin PancakeSwap V2 Router to `0xD99D1c33F9fC3444f8101754aBC46c52416550D1`.
- [ ] Pin PancakeSwap V3 Router to `0x1b81D678ffb9C0263b24A97847620C99d213eB14`.
- [ ] Pin PancakeSwap V3 Quoter to `0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2`.
- [ ] Review each V3 token pair and fee tier before adding it to `PANCAKE_V3_ALLOWED_POOLS`; preflight and post-deployment validation must resolve every entry through the canonical V3 Factory and confirm deployed pool bytecode.
- [ ] Keep `PANCAKE_V3_MAX_HOPS=2` for the first capped pilot.

## 3. Deployer funding and runtime secrets

- [ ] Fund the deployer with testnet tBNB only.
- [ ] Hold at least configured initial BNB liquidity plus `0.5` tBNB gas reserve.
- [ ] Reduce the default `10` tBNB initial-liquidity setting if faucet funding is insufficient.
- [ ] Supply `DEPLOYER_PRIVATE_KEY` only in the runtime environment.
- [ ] Confirm `.env`, `*.local.json`, and checkpoint files remain ignored by Git.
- [ ] Set `SOURCE_COMMIT` to the exact reviewed `main` commit being deployed.
- [ ] Confirm the deployment checkout is clean; preflight and deployment reject unreviewed worktree changes.

## 4. Proposed first-pilot limits

These are testnet starting points, not production risk approvals.

| Asset | Maximum per transaction | Maximum per UTC day |
|---|---:|---:|
| Test LQC | 10,000 | 100,000 |
| Mock USDT | 10,000 | 100,000 |
| WBNB | 10 | 100 |

Initial Vault safety defaults: Mock USDT asset, 100,000 deposit cap, zero strategy allocation cap,
1% normal-recall loss tolerance, and strategy allocations paused. The deployment script does not
resume allocations. Any later activation requires a separately reviewed Timelock operation after
the Strategy cap, adapter, monitoring, and risk approvals are recorded. These are testnet
configuration limits, not production terms.

The deployment record must contain `allocationsPaused: true`, and the real-address validator must
confirm the same value on-chain. A missing, false, or mismatched value blocks deployment evidence.

- [ ] Risk reviewers approve or reduce every limit before deployment.
- [ ] Every enabled DEX/token route has a non-zero cap no higher than the token transaction cap.
- [ ] The initial LQC/USDT and LQC/WBNB pool amounts are explicitly approved.
- [ ] No production token, treasury asset, or user fund is used.

## 5. Preflight and deployment

- [ ] Generate `npm run prepare:role-activation -- <deployment.json>` and review the unsigned Guardian action in the Governance Safe.
- [ ] Confirm Treasury remains unfunded until a separately approved capped-pilot funding proposal.

Run from `dex/`:

```bash
npm ci --ignore-scripts
npm run gate:stage2-predeploy
npm run deploy:testnet
```

`gate:stage2-predeploy` runs the complete Stage 1 exit gate, the production dependency audit, and
the live chain-97 deployment preflight in that fixed order. It stops immediately on the first
failure and does not broadcast a transaction.

After the deployment record is available, generate and independently review the unsigned Guardian
activation bundle with `npm run prepare:roles -- ./deployments/bsc-testnet-97.json`. Submit its single
`setGuardian` action through the recorded Governance Safe, then verify the stated postcondition before
any route smoke swap. The generator never signs or broadcasts the action.

- [ ] Confirm the activation bundle source revision and deployment fingerprint match the reviewed deployment.
- [ ] Confirm every Safe policy address in the bundle matches its recorded governance, risk, guardian, or treasury role.
- [ ] Run `verify:role-activation` against the saved bundle and deployment record before Safe submission.
- [ ] Both GitHub DEX workflows pass on the selected source commit.
- [ ] Local compilation and all automated tests pass.
- [ ] Production dependency audit reports zero vulnerabilities.
- [ ] Preflight reports `status: ready` and chain id `97`.
- [ ] Save the generated deployment record and checkpoint without secrets.
- [ ] Do not rerun with changed settings against an existing checkpoint.
- [ ] On retry, confirm every reused operation still has its original successful canonical receipt.

## 6. Post-deployment verification

```bash
npm run validate:testnet
npm run monitor:testnet
npm run prepare:verification -- ./deployments/bsc-testnet-97.json
npm run configure:app
```

- [ ] Validator confirms contract bytecode, ownership, module linkage, DEX order, adapters, V3 policy,
      Vault roles, Vault limits, and Vault/Strategy linkage.
- [ ] Validator confirms the reviewed Guardian Safe is active on-chain and all five operational roles remain separated.
- [ ] Monitor reports a fresh block, no unexplained Router custody, and fully backed Vault accounting.
- [ ] BscScan verification bundle matches `SOURCE_COMMIT` and compiler settings.
- [ ] Publish verified source for every deployed LQC contract.
- [ ] Generated UI fingerprint matches the deployment record.
- [ ] Archive contract addresses and deployment transaction hashes in the CEX evidence index.

## 7. Capped route tests

- [ ] Run read-only LQC Flow, PancakeSwap V2, and approved PancakeSwap V3 probes.
- [ ] Confirm disabled, malformed, expired, and impossible-minimum-output routes fail closed.
- [ ] Execute only small opt-in testnet smoke swaps after read-only probes pass.
- [ ] Confirm input/output token balances and approvals remain zero on Router and adapters.
- [ ] Test global pause and one-DEX pause with guardians.
- [ ] Resume only through governance and the configured timelock.
- [ ] Record transaction hashes and monitoring reports as test evidence.

## 8. Exit criteria before the next phase

- [ ] Two consecutive clean deployment validations.
- [ ] No Critical monitoring result and all Warning results explained.
- [ ] Governance and emergency pause drill completed.
- [ ] Independent reviewer signs off on addresses, limits, and evidence.
- [ ] Open Critical/High findings: zero.

Only after these items pass should LQC proceed to approved DEX liquidity validation and the later
Gasless, audit, lending, liquidation, cross-chain, and mainnet stages in the official sequence.
