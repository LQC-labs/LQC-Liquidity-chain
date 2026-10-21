# Liquidity Chain (LQC)

> Cross-DEX routing and liquidity infrastructure for fragmented Web3 markets.

Liquidity Chain (LQC) is an MMX Labs project focused on connecting fragmented liquidity across decentralized exchanges and blockchain ecosystems.

The legal entity established for the LQC project is **MMXlabs&LQC**, a limited liability company organized in the State of Wyoming, United States.

LQC provides a technical framework for cross-DEX route discovery, liquidity aggregation, protocol-level transaction execution, liquidity deployment across many DEX markets, and future DeFi services.

## LQC Flow DEX MVP

The first testnet-oriented AMM implementation is available in [`dex/`](dex/README.md). It includes a token-pair factory, constant-product liquidity pools, LP shares, token and native-BNB routing, multi-hop swaps, deployment tooling, and local integration tests. It is unaudited and must not be used with production funds.

The Liquidity Chain base protocol is not itself a centralized exchange, broker, custodian, or investment product. LQC Flow DEX is a separate, non-custodial application in development on top of that infrastructure.

## Design Principle

**Liquidity First → Utility Second → Revenue Third → Scale Last**

The project prioritizes measurable liquidity, secure protocol architecture, transparent controls, and working products over token-price narratives.

## Core Infrastructure Scope

The core infrastructure scope includes:

- Cross-DEX routing architecture
- Liquidity aggregation logic
- Optimal trade-route discovery
- Split routing across multiple liquidity pools
- Price, fee, gas, slippage, and price-impact comparison
- Liquidity pool and token registry design
- Router, vault, treasury, and access-control contracts
- Protocol fee and transaction-accounting architecture
- Scalable integration architecture for many DEXs and liquidity pools

LQC is not limited to three DEXs. The long-term objective is to connect and support liquidity across many approved DEXs and pools that satisfy protocol security, liquidity, and risk-control requirements.

The repository defines the intended architecture and scope. Production deployment, live liquidity, completed integrations, security audits, partnerships, listings, and mainnet operation are recognized only when separately announced with verifiable evidence.

Exchange and due-diligence reviewers can use the [`CEX Listing Readiness`](docs/CEX_LISTING_READINESS.md) register to distinguish reproducible repository evidence from outstanding on-chain, audit, market, legal, and operational submissions.

## Smart Router

The planned LQC Router analyzes liquidity distributed across multiple DEX pools and identifies efficient execution routes.

Route evaluation may include:

- Token price
- Available liquidity
- Pool fee
- Protocol fee
- Network gas cost
- Expected slippage
- Price impact
- Minimum output
- Transaction deadline

Where appropriate, a transaction may be divided across multiple pools to improve execution quality. Only approved DEXs, pools, and tokens will be eligible for protocol routing.

## Multi-DEX Liquidity Provision

LQC aims to provide infrastructure for supplying, allocating, and managing liquidity across many approved DEXs and liquidity pools.

Planned capabilities include:

- Liquidity provision across multiple DEX pools
- Analysis of liquidity conditions and trading activity
- Allocation adjustments based on market demand
- Controlled reallocation toward markets with insufficient liquidity
- Transparent accounting of liquidity-provider fees
- Risk controls for approved DEXs, pools, and assets

Live liquidity deployment will proceed only after smart-contract security review, liquidity testing, price-risk assessment, legal review, and formal approval.

## Protocol Architecture

| Module | Function | Status |
|---|---|---|
| Router | Quotes, route optimization, and split execution | Core scope |
| Pool Registry | Approved DEX, pool, and token management | Core scope |
| Vault | Liquidity custody and accounting architecture | Core scope |
| Treasury | Protocol fee and reserve accounting | Core scope |
| Access Control | Role separation and emergency controls | Core scope |
| Lending | Collateral deposit, borrowing, and repayment | Future scope |
| Risk Engine | LTV, health factor, liquidation, and debt caps | Future scope |
| Oracle | External price feeds and DEX TWAP validation | Future scope |
| Cross-chain | Message verification and supply accounting | Future scope |

## Planned Lending and Repayment Module

The lending module is planned and is not presented as a completed production service.

Approved risk-engine design:

- Liquidation is based on account solvency and **Health Factor**, not on a fixed percentage decline in token price.
- Protocol hard ceiling for Maximum LTV: **50%**.
- Initial BSC pilot market candidate: **50% Maximum LTV / 70% liquidation threshold / 5% maximum liquidation bonus**.
- The 50/70/5 values are market parameters for controlled validation, not universal values for every future collateral asset.
- Each approved collateral market may use stricter asset-specific LTV, liquidation-threshold, debt-cap, supply-cap, oracle, and liquidation parameters after volatility, liquidity, and liquidation-performance review.
- Borrowing is permitted only while debt value remains within the configured Maximum LTV.
- Liquidation becomes permitted when debt value exceeds collateral value multiplied by the configured liquidation threshold, equivalently when the account Health Factor falls below 1.
- Partial liquidation is the default design. The current implementation caps a liquidation at up to 50% of outstanding debt; future reviewed logic may liquidate only the amount required to restore a target Health Factor.
- Residual debt after collateral exhaustion is treated as bad debt and handled through explicit reserve / recapitalization / bounded-loss controls.
- Oracle freshness, independent price-source deviation checks, market caps, emergency pause, and governance controls are part of the Lending Risk Engine.
- Borrow assets may include approved stable assets such as USDT or USDC.
- Additional or automatic borrowing is **OFF by default** and requires explicit user opt-in if introduced.

Borrowing and liquidation remain subject to oracle, liquidity, health-factor, debt-cap, and security controls. Final deployment requires economic simulation, oracle validation, liquidity testing, legal review, independent security audits, and controlled risk limits.

## Lending Earn and LQC Staking Architecture

The approved architecture extends Lending with a separate **Earn / Staking Layer** while preserving strict accounting and security boundaries between lending assets and LQC staking.

### Lending Supply Earn

- Approved assets supplied to the Lending Pool may earn variable yield funded by actual borrower interest.
- Supply yield is not a guaranteed fixed return. It depends on utilization, borrow rates, reserves, losses, and applicable protocol parameters.
- Supply accounting, borrower debt, reserves, bad debt, and withdrawals remain inside the audited Lending accounting domain.

### LQC Staking Vault

- LQC staking is implemented as a separate vault/module rather than embedding staking balances inside Lending Core.
- Staked LQC must not be silently rehypothecated as Lending collateral or used to conceal Lending losses.
- Staking may support ecosystem utility, governance participation, Solver/ecosystem incentives, or other formally approved protocol functions.
- Rewards must come from a disclosed and bounded source such as an approved token-emission budget or realized protocol revenue. Staking does not create an unlimited minting right or guaranteed yield.
- Lock, cooldown, unstake, reward-accounting, claim, emergency-pause, and governance controls require explicit implementation and testing.

### Future Safety / Insurance Staking

A separate safety-staking or insurance-backstop design may be considered only after Lending and ordinary LQC staking are stable, economically simulated, independently audited, and legally reviewed. Any slashing or loss-bearing mechanism requires separate user disclosure and governance approval.

The intended product flow is therefore:

**Lending Supply / Borrow → Supply Earn → separate LQC Staking Vault → future reviewed Safety Staking**

This modular design allows Lending and Staking to appear as a coherent user-facing **Lending / Earn** product while keeping their accounting, deployment, risk, and audit boundaries independently verifiable.

## Oracle and Liquidation Principles

Risk must be determined by collateral value, outstanding debt, and account health—not by price decline alone.

The planned oracle architecture may combine:

- Validated external price feeds
- Sufficiently liquid DEX TWAP data
- Price-deviation checks
- Data-freshness checks
- Emergency pause controls

A single shallow LQC liquidity pool must not be used as the sole lending oracle.

## LQC Fees and Burn Mechanism

The approved LQC protocol design specifies that LQC is used for protocol fees associated with loan execution and repayment. This is a confirmed utility design decision, not an indication that the lending service is already live.

The intended flow is:

1. A user deposits an approved collateral asset.
2. The protocol calculates collateral value and borrowing capacity.
3. A defined loan-origination fee is paid or settled in LQC when borrowing is executed.
4. A defined repayment fee is paid or settled in LQC when the loan is repaid.
5. LQC used for these loan and repayment fees is burned by the protocol.
6. Burned LQC is permanently removed from circulation and cannot be reused.

This approved utility model connects real protocol usage with LQC utility and transparent supply reduction.

Fee rates, settlement mechanics, burn implementation, burn addresses, on-chain verification, and operational limits are not final. They will be published only after smart-contract review, economic analysis, legal review, and formal approval.

## LQC Utility Design

The approved protocol design includes:

- Loan-origination fee settlement in LQC
- Repayment fee settlement in LQC
- Permanent burning of LQC used for loan and repayment fees

The following additional utility concepts remain under review:

- Liquidity provision across many DEXs
- Approved lending collateral
- Protocol fee benefits
- Gas-fee support
- LQC staking through the separately accounted Staking Vault described above
- Governance
- Ecosystem access

The approved fee-and-burn design does not mean that the lending module is already deployed. Fee rates, settlement mechanics, burn implementation, burn addresses, operational limits, and launch timing remain subject to smart-contract review, economic analysis, legal review, formal approval, and on-chain verification.

Mainnet gas and validator staking would apply only if an independent LQC mainnet is separately developed, tested, audited, and launched.

## Potential Protocol Revenue

Potential future revenue sources may include:

- Routing and swap fees
- Lending and repayment fees
- Liquidation fees
- Cross-chain service fees
- Liquidity-as-a-Service agreements

Treasury allocation, staking rewards, revenue distribution, additional buyback, and burn mechanisms remain subject to governance, realized protocol revenue, legal review, and published limits.

## Approved Tokenomics Design — V1.4

**Project-owner-approved design (2026-10-21), pending reviewed repository merge, security/legal release gates and on-chain deployment.** The fixed intended supply is **1,000,000,000 LQC**. The targeted **maximum initial freely transferable allocation** is **143,800,000 LQC (14.38%)**, not a statement of actual circulation.

| Allocation | Designated wallet name | Share | Total LQC | TGE maximum | Post-TGE plan |
|---|---|---:|---:|---:|---|
| Community | LQC Community Wallet | 40% | 400,000,000 | 80,000,000 | 320M capped monthly over 120 months; initial 80M subject to actual recipient distribution |
| Team & contributors | LQC Team Wallet | 20% | 200,000,000 | 0 | 12-month lock, 36 monthly vesting releases in months 13–48 |
| Existing investors | LQC Investor Wallet | 3.8% | 38,000,000 | 3,800,000 | 3-month lock, 24 monthly releases in months 4–27; existing contracts subject to legal validation |
| Liquidity & market making | LQC Liquidity Wallet | 8% | 80,000,000 | 60,000,000 | Remaining 20M subject to approved venue/liquidity mandates |
| Treasury & operations | LQC Treasury Wallet | 8.2% | 82,000,000 | 0 | Approved and disclosed operating budgets |
| Validators & staking | LQC Validator Wallet | 10% | 100,000,000 | 0 | Pre-allocated supply only; reward target up to 96 months after native mainnet launch |
| Ecosystem development | LQC Ecosystem Wallet | 5% | 50,000,000 | 0 | Milestone-driven ecosystem grants |
| Security & risk reserve | LQC Security Wallet | 3% | 30,000,000 | 0 | Multisig-approved security use; not LQUSD backing |
| Mainnet activation | LQC Mainnet Wallet | 2% | 20,000,000 | 0 | Stage-based use after mainnet launch; indicative 24 months |
| **TOTAL** | **9 allocation wallets** | **100%** | **1,000,000,000** | **143,800,000** | |

At TGE, planned maximum transferability is Community 80M + Investors 3.8M + Liquidity 60M = **143.8M**; any undistributed, locked or restricted inventory must be excluded from actually reported circulating supply. Community remaining 320M: 120 monthly program limits (10 years); Team 200M: 12-month lock plus 36 monthly releases (months 13–48); Investor remaining 34.2M: 3-month lock plus 24 monthly releases (months 4–27). All actual beneficiary rights remain subject to verified vesting contracts and legal agreement reconciliation.

Nine wallet labels identify management responsibility rather than confirming custody balances. Token allocation and vesting restrictions must be enforced by audited contracts where appropriate. See [canonical tokenomics](docs/CANONICAL_TOKENOMICS.md).

### Staking rewards, no inflation, and future mainnet

- Issuance may **not exceed 1,000,000,000 LQC**. Any user-authorized burning reduces supply.
- Validator/staking token-denominated incentives may use only an approved portion of the existing **Validators & Staking 10% / 100M LQC** allocation, not new token minting.
- Protocol-revenue rewards, if activated, require distinct accounting, funded realized revenue and no guaranteed yield. User principal or protected reserves are never reward sources.
- On any later native-mainnet migration, provable burn or custody-backed lock and controlled 1:1 destination claims must prevent duplicate circulating supply across BSC and the future chain. Exact migration mechanism is **not yet approved or implemented**.
- Legacy **6-category / 15% TGE** tokenomics was an earlier architecture baseline, preserved in historical commits. CEX submission, official PDF and public website must be reconciled before describing V1.4 as live. No token deployment/audit/listing is claimed.


## Roadmap

The dependency-ordered implementation plan is maintained in [`LQC Development Sequence`](docs/DEVELOPMENT_SEQUENCE.md). It defines the evidence gate required before each later module begins.


1. **Foundation** — Router architecture, pool registry, vault, treasury, and access controls
2. **Router MVP** — Multi-DEX quotes, route optimization, split routing, and SDK/API
3. **Controlled Integration** — Selected DEX and liquidity-pool integrations with testing and transaction limits
4. **Liquidity Expansion** — Gradual liquidity deployment across additional approved DEXs and pools
5. **Lending Module** — Collateral, borrowing, repayment, oracle, health factor, liquidation, LQC fees, and burn
6. **Cross-chain Expansion** — Bridge controls, rate limits, and cross-chain supply accounting
7. **Ecosystem Alliance** — Wallet, DeFi, market-maker, and enterprise integrations
8. **Future Research** — AI-assisted routing, RWA liquidity, and an independent mainnet

Each stage depends on implementation progress, testing, security review, liquidity conditions, regulatory considerations, and formal approval.

## Security and Transparency

The target security framework includes:

- Independent smart-contract audits
- Bug-bounty programs
- Multisignature treasury controls
- Timelocks for privileged operations
- Separation of administrative roles
- Function-level emergency pauses
- Controlled TVL, borrowing, and transaction limits
- Public contract, treasury, and burn addresses
- On-chain burn verification
- Token vesting disclosures
- Regular protocol-performance reporting

No single private key should control token supply, treasury, oracle, bridge, burn, and emergency privileges.

The DEX repository also provides a reproducible [`security test matrix`](dex/docs/SECURITY_TEST_MATRIX.md), [`audit scope`](dex/docs/AUDIT_SCOPE.md), and [`audit handoff`](dex/docs/AUDIT_HANDOFF.md). These are preparation materials and do not claim that an independent audit has been completed.

## Project Scope

The primary scope covers cross-DEX routing, liquidity aggregation, multi-DEX liquidity architecture, and related protocol and smart-contract implementation.

Lending, LQC fee burning, staking, governance, expanded token utility, cross-chain expansion, front-end applications, live liquidity, completed integrations, production deployment, audits, listings, partnerships, and an independent mainnet are included in the roadmap or remain subject to verification.

## Disclaimer

This repository is provided for technical and informational purposes only.

It does not constitute investment, legal, financial, or tax advice, an offer, a solicitation, or a guarantee of returns.

Digital assets and DeFi protocols involve smart-contract, oracle, bridge, liquidity, market, operational, cybersecurity, and regulatory risks.

---

**MMX Labs · Liquidity Without Boundaries**
