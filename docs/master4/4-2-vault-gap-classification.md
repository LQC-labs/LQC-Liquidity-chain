# Master 4/2 — Vault Gap Classification

Status: verification-only
Base: c4e244732ab50a5c2da560ebdb0f40235d986273

4/1 confirmed that the existing vault already implements the accounting and strategy safety core. 4/2 therefore classifies only demonstrated gaps.

## P0 gaps

- **G1 — standardized read-only Vault interface:** Router/Lending integrations should depend on a narrow reviewed interface instead of concrete Vault internals.
- **G2 — explicit liquidity-availability view:** consumers need a read-only value for immediately withdrawable/accounted idle liquidity without becoming accounting authorities.

## P1 gap

- **G3 — strategy adapter identity/version metadata:** future chain-specific adapters should expose stable identity/version evidence.

## Deferred

Multi-strategy allocation and automatic rebalancing are deliberately deferred. Adding them now would increase accounting and attack surface before a demonstrated requirement.

No on-chain state is changed in 4/2.

`activationAuthorized: false`
