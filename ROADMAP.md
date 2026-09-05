# LQC Development Roadmap

This roadmap is gated by evidence, security review, liquidity conditions, legal review, and formal approval. Dates are intentionally omitted until dependencies are verified. Roadmap inclusion does not represent a completed integration, partnership, listing, or deployment.

## Phase 1 — Router MVP

**Status: substantially implemented locally**

- Constant-product AMM factory, pairs, liquidity, and swaps
- Best-route quoter
- Adapter-based Router 2.0
- Native BNB single-route execution
- ERC-20 split quotation and execution
- Uniswap V2-compatible DEX adapter
- Direct, one-hop, and two-hop off-chain path generation
- Gas-aware SDK ranking and two-way split optimization
- Wallet-connected static trading interface
- Local automated test suite

Exit evidence: reproducible compilation, automated test results, conservative documentation, and reviewed source history.

## Phase 2 — Testnet Hardening

**Status: tooling implemented; deployment pending**

- Expand boundary, differential, invariant, fuzz, and fork tests
- Add transaction preview, price-impact warning, and gas estimate to the UI
- Validate official BSC testnet WBNB and external DEX router addresses
- Deploy contracts to BSC testnet from a controlled account
- Verify source code on BscScan
- Publish addresses, compiler settings, deployment transaction hashes, and configuration
- Run failure, recovery, and RPC-degradation scenarios
- Apply initial transaction and adapter limits

Exit evidence: verified testnet contracts, reproducible deployment record, complete test report, and resolved high-severity internal findings.

## Phase 3 — Security and Governance Readiness

**Status: planned**

- Complete formal threat model
- Commission independent smart-contract audit
- Remediate findings and publish audit artifacts
- Transfer privileged roles to multisig
- Introduce timelocks and function-level emergency controls
- Establish security contact, disclosure process, and bug bounty
- Deploy monitoring for contract, adapter, balance, and privilege events
- Document change management and incident response

Exit evidence: independent audit, verified remediation, operational controls, and named accountable roles.

## Phase 4 — Controlled Liquidity Pilot

**Status: planned**

- Approve a limited token, pool, and adapter set
- Establish TVL, per-transaction, daily-volume, and price-impact caps
- Fund only formally approved test/pilot liquidity
- Monitor execution quality, failure rate, gas usage, and route concentration
- Compare expected output with realized output
- Exercise pause and recovery procedures
- Obtain legal and risk approval for each supported jurisdiction and service

Exit evidence: stable pilot metrics, reconciled accounting, completed incident drills, and formal go/no-go approval.

## Phase 5 — Multi-DEX Expansion

**Status: planned**

- Add reviewed adapters for additional compatible DEXs
- Add richer liquidity and gas data sources
- Improve split granularity and route-pruning efficiency
- Introduce protected execution and MEV-risk mitigations where practical
- Publish integration criteria and ongoing adapter-risk monitoring
- Expand API/SDK support for wallets and ecosystem applications

Exit evidence: adapter-specific reviews, measurable execution improvement, reliable monitoring, and controlled scaling.

## Phase 6 — Token and Exchange Integration Readiness

**Status: planned**

- Implement and audit the LQC token, supply controls, and vesting contracts
- Fix total supply at the approved design of 1,000,000,000 LQC
- Reconcile the planned 150,000,000 LQC TGE circulation with verified wallets and vesting contracts
- Publish verified token address, decimals, ownership, mint controls, holder data, and unlock schedule
- Complete deposit/withdrawal test support and wallet integration documentation
- Align GitHub, website, whitepaper, legal materials, and application data

Exit evidence: verified on-chain contracts and wallets, audit evidence, consistent disclosures, and successful integration testing. Exchange admission remains solely at each exchange's discretion.

## Phase 7 — Lending and LQC Fee Utility

**Status: research and design**

- Collateral vault and lending pool
- Borrowing, repayment, health factor, and partial liquidation
- External price feeds plus sufficiently liquid DEX TWAP validation
- Oracle freshness, deviation, fallback, and pause rules
- Debt ceilings and collateral-specific risk parameters
- LQC-denominated loan and repayment fees with verifiable permanent burn

Exit evidence: economic simulation, oracle validation, independent audit, capped pilot, legal review, and transparent burn accounting.

## Phase 8 — Cross-Chain and Future Research

**Status: future scope**

- Bridge message validation and rate limits
- Cross-chain supply reconciliation
- Additional network integrations
- AI-assisted routing research
- RWA liquidity research
- Independent LQC mainnet research only after separate design, testing, audits, and governance approval

Each item requires a separate specification and must not be inferred as live from its inclusion in this roadmap.
