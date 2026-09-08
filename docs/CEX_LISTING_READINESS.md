# LQC Centralized Exchange Listing Readiness

Status: **working evidence register — not a listing, audit, or legal-approval claim**

This checklist gives exchange reviewers a single place to distinguish repository evidence from evidence that must still be supplied by LQC's legal, security, token, and market-operations teams. A checked repository control does not replace an exchange's independent due diligence.

For an actual submission, copy and complete the [`Exchange Due-Diligence Evidence Index`](CEX_EVIDENCE_INDEX_TEMPLATE.md), pin every technical item to a commit, and attach confidential legal/KYC materials only through the exchange’s secure channel.

## Status definitions

| Status | Meaning |
|---|---|
| Implemented / repository evidence | The named source, test, workflow, or document exists in this repository and can be reproduced. |
| Pending external evidence | A responsible party must provide a signed, published, or on-chain artifact before submission. |
| Not claimed | LQC must not describe the item as complete or live. |

## Technical and security evidence

| Review item | Status | Required evidence / current reference |
|---|---|---|
| Reproducible DEX build and tests | Implemented / repository evidence | Run `cd dex && npm ci && npm test`; CI uses the locked dependency graph. See [`dex/docs/SECURITY_TEST_MATRIX.md`](../dex/docs/SECURITY_TEST_MATRIX.md). |
| DEX audit scope and reviewer handoff | Implemented / repository evidence | [`dex/docs/AUDIT_SCOPE.md`](../dex/docs/AUDIT_SCOPE.md) and [`dex/docs/AUDIT_HANDOFF.md`](../dex/docs/AUDIT_HANDOFF.md). |
| BSC testnet deployment validation | Implemented / repository evidence | Chain ID 97, deployed bytecode, ownership, adapter and module-link checks are implemented in `dex/scripts/validate-bsc-testnet.mjs`. |
| Explorer verification package | Implemented / repository evidence | `npm run prepare:verification -- <deployment-record>` produces compiler settings, standard JSON input, source revision, and per-contract metadata. Actual explorer verification remains deployment-specific. |
| Independent smart-contract audit | Pending external evidence | Auditor identity, engagement scope, pinned commit SHA, final report URL/hash, findings, remediation commits, and retest confirmation. |
| Critical/high findings resolved | Pending external evidence | Auditor-confirmed disposition for every critical/high finding and an explicit known-issues register. |
| Production monitoring and incident response | Pending external evidence | Named responders, alert coverage, escalation contacts, pause procedure, key-loss procedure, postmortem policy, and drill record. Security reports currently use [`SECURITY.md`](../SECURITY.md). |
| Mainnet production readiness | Not claimed | The DEX is an unaudited testnet MVP. Production oracle configuration, integrations, risk parameters, signers, monitoring, and capped pilot evidence are not final. |

## Token and on-chain evidence

| Review item | Status | Required evidence / current reference |
|---|---|---|
| Current disclosed tokenomics | Repository disclosure | Fixed total supply: **1,000,000,000 LQC**; planned TGE circulation: **150,000,000 LQC (15%)**. The allocation table in the root [`README.md`](../README.md) is the current repository disclosure. |
| Token contract and decimals | Pending external evidence | Final network, canonical contract address, decimals, deployment transaction, deployer, creation bytecode, ABI, and explorer-verified source. |
| Supply matches contract state | Pending external evidence | `totalSupply`, mint/burn permissions, holder distribution, circulating-supply method, and timestamped explorer/API evidence. |
| Allocation and TGE reconciliation | Pending external evidence | Signed allocation register whose percentages, token amounts, TGE unlocks, and totals reconcile exactly to the disclosed supply. |
| Vesting enforcement | Pending external evidence | Vesting contract addresses, beneficiaries/categories, cliffs, schedules, revocation rights, deployment transactions, and verified source. |
| Privileged token controls | Pending external evidence | Evidence for owner/admin, mint, pause, blacklist, upgrade/proxy, recovery, and burn powers; state explicitly when a capability does not exist. |
| Multisig and timelock control | Pending external evidence | Addresses, signer threshold, signer/control policy, timelock delay, role assignments, ownership-transfer transactions, and tested emergency procedure. Do not publish private signer data. |

## Market and operational evidence

| Review item | Status | Required evidence / current reference |
|---|---|---|
| Live liquidity, TVL, volume, holders, active wallets | Pending external evidence | Timestamped, reproducible on-chain queries with network, contracts, block height, methodology, and data source. No metric is claimed in this repository. |
| Market-making plan | Pending external evidence | Counterparty, venue scope, inventory ownership, spreads/depth targets, wash-trading prohibition, reporting, termination, and conflict controls. |
| Deposit/withdrawal integration data | Pending external evidence | Canonical network, confirmations, decimals, minimums, fee handling, memo/tag rules if any, reorg policy, RPC/explorer endpoints, and technical contact. |
| Circulating-supply reporting | Pending external evidence | Public methodology, excluded wallets, vesting/treasury labels, update cadence, responsible owner, and reconciliation to on-chain state. |
| Official channels and repository ownership | Pending external evidence | Domain-control proof, verified social links, repository-organization ownership, release-signing policy, and authorized exchange contacts. |

## Legal and compliance evidence

| Review item | Status | Required evidence / current reference |
|---|---|---|
| Legal entity documentation | Pending external evidence | Current formation document, good-standing evidence, registered address, directors/managers, beneficial owners, and authorized signatory proof for the disclosed Wyoming entity. |
| KYC/KYB and sanctions screening | Pending external evidence | Exchange-requested identity/corporate package and compliance attestations delivered through the exchange's secure channel. |
| Token legal analysis | Pending external evidence | Current jurisdiction-specific legal opinion covering token characterization, distribution, marketing, restrictions, and exchange availability. |
| AML and market-integrity controls | Pending external evidence | Applicable AML/KYC policy, sanctions policy, suspicious-activity escalation, market-abuse controls, record retention, and responsible compliance contact. |
| Regulatory approval | Not claimed | No license, registration, exemption, or regulator approval should be inferred from this repository. |

## Submission gate

Before an exchange submission, the project owner should create a dated evidence index that pins every technical artifact to one Git commit and every on-chain artifact to a network and block height. Any pending row must be completed, marked not applicable with reviewer-approved reasoning, or disclosed as an unresolved risk. Marketing materials, the whitepaper, website, token contract, vesting schedules, and application forms must use identical supply and allocation figures.
