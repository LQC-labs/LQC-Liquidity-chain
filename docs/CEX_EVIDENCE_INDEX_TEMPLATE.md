# LQC Exchange Due-Diligence Evidence Index

Status: **submission template — complete only with verifiable evidence**

Use this document as the dated cover index for an exchange review package. Replace every placeholder before submission. Do not mark an item complete unless the linked evidence is accessible to the reviewer and matches the whitepaper, website, contracts, and application form.

## Submission snapshot

| Field | Value |
|---|---|
| Package version | [YYYY-MM-DD / version] |
| Repository | LQC-labs/LQC-Liquidity-chain |
| Pinned review commit | [40-character commit SHA] |
| Network | [BSC testnet / BSC mainnet] |
| Canonical LQC contract | [Pending / address] |
| Evidence block height | [Pending / block number] |
| Authorized submitter | [Name, title, corporate authority] |
| Security contact | [Role-based email] |
| Legal contact | [Role-based email] |

## Repository and build evidence

| ID | Evidence | Status | Location / hash | Owner | Verified date |
|---|---|---|---|---|---|
| TECH-01 | Reproducible install and test result | Repository evidence | `cd dex && npm ci && npm test` at pinned commit | Engineering | [date] |
| TECH-02 | CI workflow result | [Pending] | [Workflow URL and run ID] | Engineering | [date] |
| TECH-03 | BSC testnet deployment record | [Pending] | [Network, addresses, tx hashes] | Engineering | [date] |
| TECH-04 | Explorer source verification | [Pending] | [BscScan URLs] | Engineering | [date] |
| TECH-05 | Contract ABI and compiler settings | [Pending] | [Artifact path/hash] | Engineering | [date] |

## Security evidence

| ID | Evidence | Status | Location / hash | Owner | Verified date |
|---|---|---|---|---|---|
| SEC-01 | Independent audit report | [Pending] | [Auditor, URL, report hash] | Security | [date] |
| SEC-02 | Findings and remediation matrix | [Pending] | [Pinned fixes and retest evidence] | Security | [date] |
| SEC-03 | Multisig configuration | [Pending] | [Address, threshold, policy] | Operations | [date] |
| SEC-04 | Timelock and privileged-role map | [Pending] | [Addresses and delay] | Security | [date] |
| SEC-05 | Incident-response plan and drill | [Pending] | [Document and drill record] | Operations | [date] |
| SEC-06 | Known issues and accepted risks | [Pending] | [Register URL/hash] | Security | [date] |

## Token and supply evidence

| ID | Evidence | Status | Location / hash | Owner | Verified date |
|---|---|---|---|---|---|
| TOK-01 | Fixed total supply: 1,000,000,000 LQC | Design disclosure | [Contract/explorer evidence when deployed] | Token operations | [date] |
| TOK-02 | Planned TGE circulation: 150,000,000 LQC (15%) | Design disclosure | [Signed allocation register] | Token operations | [date] |
| TOK-03 | Allocation reconciliation | [Pending] | [Percent, amount, TGE and total checks] | Finance | [date] |
| TOK-04 | Vesting contracts and schedules | [Pending] | [Addresses and verified source] | Token operations | [date] |
| TOK-05 | Wallet labels and circulating-supply method | [Pending] | [Public methodology] | Finance | [date] |
| TOK-06 | Mint, burn, pause and upgrade powers | [Pending] | [Explicit capability statement] | Engineering | [date] |

## Market and operations evidence

| ID | Evidence | Status | Location / hash | Owner | Verified date |
|---|---|---|---|---|---|
| MKT-01 | Liquidity and market-making plan | [Pending] | [Signed plan / agreement] | Market operations | [date] |
| MKT-02 | Wash-trading prohibition and controls | [Pending] | [Policy] | Compliance | [date] |
| MKT-03 | On-chain liquidity, holders and volume | [Pending] | [Query, block height, methodology] | Analytics | [date] |
| OPS-01 | Deposit and withdrawal parameters | [Pending] | [Integration sheet] | Engineering | [date] |
| OPS-02 | RPC, explorer and confirmations | [Pending] | [Network sheet] | Engineering | [date] |
| OPS-03 | Official domain, socials and contacts | [Pending] | [Control proofs] | Operations | [date] |

## Legal and compliance evidence

| ID | Evidence | Status | Location / hash | Owner | Verified date |
|---|---|---|---|---|---|
| LEG-01 | Wyoming formation and good standing | [Pending] | [Secure submission reference] | Legal | [date] |
| LEG-02 | Managers, beneficial owners and signatory authority | [Pending] | [Secure submission reference] | Legal | [date] |
| LEG-03 | KYC/KYB and sanctions package | [Pending] | [Secure submission reference] | Compliance | [date] |
| LEG-04 | Token legal analysis | [Pending] | [Counsel, date, jurisdiction] | Legal | [date] |
| LEG-05 | AML and market-integrity policies | [Pending] | [Policy references] | Compliance | [date] |

## Consistency sign-off

Before submission, confirm all statements below.

- [ ] The whitepaper, website, README, application, token contract, allocation register, and vesting schedules all state the same supply and TGE figures.
- [ ] Every “live,” “deployed,” “audited,” “partner,” or “listed” claim has a reviewer-accessible source.
- [ ] Planned features are clearly separated from implemented or production-ready features.
- [ ] Every contract address is tied to the correct network and verified source.
- [ ] Every technical artifact is pinned to the review commit.
- [ ] Every on-chain metric includes a block height, timestamp, method, and data source.
- [ ] Private keys, seed phrases, personal identity files, and confidential signer details are excluded from the public repository.
- [ ] Confidential corporate and KYC materials are supplied only through the exchange’s secure channel.

## Final authorization

| Role | Name | Signature / approval reference | Date |
|---|---|---|---|
| Project owner | [Pending] | [Pending] | [date] |
| Engineering | [Pending] | [Pending] | [date] |
| Security | [Pending] | [Pending] | [date] |
| Legal / compliance | [Pending] | [Pending] | [date] |
| Market operations | [Pending] | [Pending] | [date] |
