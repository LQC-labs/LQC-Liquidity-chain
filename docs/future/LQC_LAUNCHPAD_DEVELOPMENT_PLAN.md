# LQC Launchpad — Future Architecture & Development Plan

Status: **Future Module / Architecture Proposal**
Current Core Master Plan impact: **None**
Production activation: **Forbidden until explicit future approval, testnet evidence, security review and legal/KYB readiness**

## 1. Product Position

LQC Launchpad is not a standalone token-sale website. It is a future LQC ecosystem module that connects:

Project Registration → Sale / Allocation → Escrow → Vesting / Refund → Liquidity Bootstrap → LQC Flow → Router 2.0 → LQC Ecosystem

The module must reuse reviewed LQC interfaces without becoming an accounting authority over Lending, Futures, Vault or Intent/Solver.

## 2. Architecture Principle

Launchpad remains an independent accounting/failure domain.

- Launchpad participant funds are held only in Launchpad Escrow.
- Launchpad funds must not be rehypothecated into Lending, Futures or general Vault strategies.
- Router 2.0 / LQC Flow may be used only through reviewed execution interfaces for post-sale liquidity bootstrap.
- Oracle is optional in V1 and required only where pricing logic actually depends on external market data.
- Treasury/Governance controls are explicit and separated from participant accounting.
- Emergency pause may stop new contributions but must not silently confiscate participant funds or erase refund rights.

## 3. V1 Scope

V1 supports only two sale mechanisms:

1. **Fixed Price Sale**
   - hard cap / soft cap
   - per-wallet minimum and maximum
   - start / end time
   - allowlist / eligibility hook
   - oversubscription handling through deterministic allocation rules

2. **Fair Allocation Auction**
   - capped contribution period
   - deterministic pro-rata settlement
   - explicit maximum effective price / valuation boundary if used
   - no hidden admin repricing after the sale opens

Bonding curves, leverage, launch derivatives, cross-chain contribution and auto-lending of sale proceeds are deferred.

## 4. Core Contracts / Components

### LPAD/1 — ProjectRegistry

Stores project identity, sale eligibility state, metadata hash, token address, treasury address and governance approval state.

### LPAD/2 — SaleFactory

Creates versioned sale instances from reviewed templates. New template versions cannot mutate existing sales.

### LPAD/3 — SaleEscrow

Custodies participant contribution assets. Funds remain isolated per sale.

### LPAD/4 — SaleEngine

Handles contribution windows, wallet caps, sale caps, allowlist policy and immutable sale terms after opening.

### LPAD/5 — AllocationEngine

Calculates deterministic participant allocations. Fixed-price and pro-rata allocation logic are separate strategies.

### LPAD/6 — Settlement / Refund

Finalizes success or failure. Successful sales release only approved proceeds; failed/cancelled sales expose refunds.

### LPAD/7 — VestingVault

Stores or controls sold project tokens and releases them according to immutable vesting schedules.

### LPAD/8 — LiquidityBootstrapManager

Uses only the predefined liquidity budget after successful settlement. Integrates with LQC Flow / Router through reviewed interfaces and enforces slippage, deadline, token pair and liquidity-budget bounds.

### LPAD/9 — LaunchAccessPolicy

Optional policy layer for allowlists, jurisdiction/eligibility attestations and future LQC utility. The SaleEngine must not hard-code one access model.

### LPAD/10 — LaunchpadTreasury

Receives only explicitly approved protocol/project fees after settlement. It cannot become the participant Escrow owner.

### LPAD/11 — Access / Guardian

Two-step owner/governance control and separate pause guardian. Guardian may stop new-risk actions; only approved governance may resume or change critical configuration.

### LPAD/12 — Monitoring / Evidence

Produces deterministic sale state, allocation, claim, refund and liquidity-bootstrap evidence for UI, audit and exchange/partner due diligence.

## 5. Mandatory Accounting Invariants

1. Contribution accounting must equal the sum of participant credited contributions.
2. Sale-token accounting must reconcile allocated, claimable, vested, liquidity-reserved, refunded/reclaimed and unsold balances.
3. A participant cannot both refund and retain a successful-sale allocation for the same contribution.
4. Claiming must be replay-safe and cannot exceed vested entitlement.
5. Project/admin cannot withdraw participant contributions before valid successful settlement.
6. Failed or cancelled sales cannot release project proceeds.
7. Liquidity bootstrap cannot spend more than the precommitted liquidity budget.
8. Unsolicited token transfers must not inflate participant entitlement.
9. Sale terms that affect price, cap, allocation or vesting become immutable after opening, except explicitly bounded emergency cancellation.
10. Launchpad state must never become an input that silently mutates Lending, Futures or Vault accounting.
11. Emergency pause must be fail-closed for new contributions while preserving safe refund/claim exits according to sale state.
12. Every state transition must be event-auditable.

## 6. LQC Integration Rules

### LQC Flow
Used for post-sale spot-liquidity creation after successful settlement.

### Router 2.0
Used for reviewed execution / liquidity placement only. Router cannot mutate Launchpad participant accounting.

### Vault / Liquidity
General LQC Vault is not the participant Escrow. A future reviewed liquidity-management interface may be used only after settlement.

### Oracle
No Oracle dependency is required for basic fixed-price V1. If dynamic or market-referenced pricing is added later, it must consume the reviewed Oracle Foundation interface and fail closed.

### Lending / Earn / Staking
Launchpad funds and project tokens are not automatically supplied, borrowed, staked or rehypothecated. Any future integration is opt-in and separately gated.

### Futures
No direct dependency in V1.

### Intent / Solver / Settlement
Future cross-chain or solver-assisted launch participation is post-V1 scope and requires a dedicated integration gate.

### Risk / Treasury / Governance
Shared governance standards may be reused, but Launchpad maintains an independent emergency/failure domain.

## 7. LQC Token Utility — Optional, Modular

LQC utility must be implemented through `LaunchAccessPolicy`, not embedded into SaleEngine.

Possible future policies:
- LQC staking tier increases contribution cap;
- long-term LQC staking improves allocation weight within a disclosed maximum;
- fee discounts paid in LQC;
- governance-approved community allocation pools.

Forbidden design:
- guaranteed allocation solely because a user buys LQC;
- guaranteed investment return;
- hidden allocation multipliers;
- changes to allocation rules after the sale opens.

## 8. Development Sequence

### L0 — Architecture Freeze
L0/1 Product scope
L0/2 threat model
L0/3 legal/KYB interface boundary
L0/4 accounting model
L0/5 state machine
L0/6 integration boundary
L0/7 invariant set
L0/8 implementation matrix

### L1 — Project / Sale Registry
L1/1 ProjectRegistry
L1/2 Sale template versioning
L1/3 deterministic sale ID
L1/4 project status lifecycle
L1/5 governance approval boundary

### L2 — Escrow
L2/1 single contribution asset
L2/2 exact-balance accounting
L2/3 fee-on-transfer rejection
L2/4 unsolicited-transfer isolation
L2/5 pause / safe-exit rules
L2/6 Escrow invariants

### L3 — Fixed Price Sale
L3/1 sale window
L3/2 hard/soft cap
L3/3 wallet min/max
L3/4 eligibility hook
L3/5 immutable open-sale parameters
L3/6 oversubscription policy
L3/7 contribution E2E

### L4 — Fair Allocation
L4/1 pro-rata math
L4/2 deterministic rounding
L4/3 dust policy
L4/4 anti-double-allocation
L4/5 allocation commitment
L4/6 allocation E2E

### L5 — Settlement / Refund
L5/1 success finalization
L5/2 failure/cancel finalization
L5/3 project proceeds release
L5/4 participant refund
L5/5 replay protection
L5/6 settlement E2E

### L6 — Vesting / Claim
L6/1 vesting schedule
L6/2 cliff
L6/3 linear vesting
L6/4 claim accounting
L6/5 claim replay protection
L6/6 emergency/cancel behavior
L6/7 vesting E2E

### L7 — Liquidity Bootstrap
L7/1 liquidity budget commitment
L7/2 LQC Flow pair validation
L7/3 Router execution boundary
L7/4 slippage/deadline constraints
L7/5 bootstrap receipt/evidence
L7/6 bootstrap E2E

### L8 — LQC Utility
L8/1 LaunchAccessPolicy interface
L8/2 staking-tier adapter
L8/3 contribution-cap policy
L8/4 fee-discount policy
L8/5 governance limits
L8/6 utility E2E

### L9 — Monitoring / UI
L9/1 sale-state API
L9/2 contribution / allocation UI
L9/3 claim / refund UI
L9/4 project disclosure page
L9/5 liquidity-bootstrap status
L9/6 mobile E2E

### L10 — Security
L10/1 access-control matrix
L10/2 reentrancy
L10/3 accounting/invariant fuzzing
L10/4 rounding attacks
L10/5 oversubscription griefing
L10/6 refund/claim replay
L10/7 malicious token behavior
L10/8 admin abuse / cancellation
L10/9 Router bootstrap abuse
L10/10 remediation

### L11 — BSC Testnet
L11/1 deployment manifest
L11/2 role assignment
L11/3 mock project launch
L11/4 success-sale E2E
L11/5 failed-sale refund E2E
L11/6 vesting claim E2E
L11/7 liquidity bootstrap E2E
L11/8 evidence package

### L12 — Audit / Capped Pilot
L12/1 audit commit freeze
L12/2 independent audit
L12/3 remediation/retest
L12/4 legal/KYB readiness
L12/5 capped pilot limits
L12/6 monitoring / incident runbook
L12/7 pilot go/no-go

## 9. Entry / Exit Gates

Development may begin as a separate branch/module without changing the current Core Master numbering.

Production or public pilot is blocked until:
- existing LQC Core dependencies used by Launchpad are stable;
- Launchpad E2E and security gates pass;
- BSC Testnet evidence is reproducible;
- governance/role ownership is finalized;
- legal/KYB requirements for the target launch jurisdiction and sale model are reviewed;
- an explicit Launchpad pilot approval is recorded.

## 10. Suggested Implementation Order

Recommended V1 critical path:

L0 Architecture Freeze
→ L1 Registry
→ L2 Escrow
→ L3 Fixed Price Sale
→ L5 Settlement / Refund
→ L6 Vesting
→ L7 Liquidity Bootstrap
→ L9 UI / Monitoring
→ L10 Security
→ L11 Testnet
→ L12 Audit / Pilot

L4 Fair Allocation and L8 LQC Utility can be developed after the basic Fixed Price path is stable to reduce initial attack surface and shorten time to a secure V1.

## 11. Repository Rule

This Launchpad plan is a **future module** and does not renumber or replace the existing 1–15 LQC Master Development Plan. Current Core development continues from its existing CURRENT point.

`activationAuthorized: false`
