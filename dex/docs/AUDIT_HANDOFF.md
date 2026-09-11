# LQC Flow DEX Audit Handoff

Status: **reviewer handoff template — no completed audit is claimed**

## 1. Pin the review baseline

Use [`AUDIT_SUBMISSION_CHECKLIST.md`](AUDIT_SUBMISSION_CHECKLIST.md) to compare independent
auditors and track submission, remediation, and retest evidence.
The current non-binding candidate shortlist is [`AUDITOR_CANDIDATE_COMPARISON.md`](AUDITOR_CANDIDATE_COMPARISON.md).

The engagement owner must record the exact Git commit SHA before review begins. Do not audit a moving branch.

```bash
git rev-parse HEAD
cd dex
npm ci
npm test
```

Record the Node.js version, operating system, package-lock hash, Solidity compiler version (`0.8.30` in the current package), optimizer settings, command output, and CI run URL. The current security-property mapping is in [`SECURITY_TEST_MATRIX.md`](SECURITY_TEST_MATRIX.md).

## 2. In-scope system

Use [`AUDIT_SCOPE.md`](AUDIT_SCOPE.md) as the initial scope. The intended review boundary includes:

- LQC Flow factory, pair, router, LP accounting, native-BNB handling, and safe-transfer/math libraries;
- Router 2.0 registry, quote, optimizer, auto, execution, native, oracle, governance, emergency, and risk modules;
- LQC Flow and reviewed PancakeSwap V2/V3 adapters;
- route-encoding SDK plus deployment, validation, and explorer-verification tooling where they affect secure configuration.

Mocks and test tokens are test infrastructure, not production token implementations.

## 3. Deployment assumptions to freeze

Before final review, provide a machine-readable deployment record and document:

- network and chain ID; canonical RPC and explorer;
- every contract, proxy/implementation if any, library, adapter, external router, factory, WBNB, pool, and oracle address;
- compiler, EVM target, optimizer settings, constructor arguments, salts if any, and deployment transactions;
- owner, proposer, executor, guardian, risk role, multisig, threshold, and timelock assignments;
- approved tokens, pools, fee tiers, caps, oracle feeds, freshness/deviation limits, and emergency state;
- upgrade, mint, pause, recovery, withdrawal, and self-destruct capabilities, including an explicit statement when absent.

Run the read-only deployment validator against the real addresses. Then create the explorer package:

```bash
cd dex
npm run validate:testnet
npm run prepare:verification -- ./deployments/bsc-testnet-97.json
```

Publish verified source only after confirming that the bundle's source revision and settings match the reviewed commit.

## 4. Threat model

Review at minimum:

- malicious tokens, callbacks, fee-on-transfer/rebasing behavior, approval anomalies, and balance-accounting differences;
- malicious, paused, replaced, or incorrectly linked DEX adapters and external routers;
- price manipulation, stale/deviating feeds, gas-cost manipulation, rounding, dust, and split-route optimization errors;
- cap bypass, duplicate legs, UTC-day accounting, transaction reverts, denial of service, and frontrunning/slippage;
- compromised deployer, governance, guardian, risk role, multisig signer, frontend, RPC, oracle, or dependency;
- incorrect initialization, ownership transfer, timelock scheduling, deployment record, or explorer verification;
- economic attacks on thin liquidity and unsafe assumptions at integration boundaries.

## 5. Explicit exclusions and unresolved dependencies

Unless separately added to a signed scope, the current repository does not claim review or production completion for:

- a final production LQC token, vesting contracts, bridge, lending, perpetuals, staking, governance token utility, fee conversion, or burn logic;
- production oracle feeds and parameters, final multisig signers, token/pool allowlists, risk caps, monitoring, and incident operations;
- fee-on-transfer or rebasing token support, permit signatures, and protocol-fee accounting;
- frontend hosting/security, legal or regulatory compliance, market making, custody, and centralized-exchange operations.

## 6. Required auditor deliverables

The final package should contain:

1. auditor identity and report date;
2. exact reviewed commit SHA, contracts, files, compiler/settings, network assumptions, and exclusions;
3. methodology, tools, manual-review areas, and test commands;
4. each finding's severity, impact, exploit scenario, affected code, recommendation, and status;
5. remediation commit(s), auditor retest evidence, and disposition of every critical/high item;
6. residual risks, privileged-role risks, centralization assumptions, and known issues;
7. cryptographically verifiable report publication or stable report URL and checksum.

Any code, configuration, role, address, compiler, or dependency change after the pinned review must be assessed for audit impact. An audit report must never be presented as covering a different commit or deployment.
