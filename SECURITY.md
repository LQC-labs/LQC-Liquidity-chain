# LQC Security Policy

## Current security status

LQC Flow DEX and Router 2.0 are an **unaudited testnet MVP**. They must not be used with production funds until independent audits, remediation, governance configuration, monitoring, and controlled deployment gates are complete.

## Supported scope

Security review currently covers the contracts, deployment tooling, browser routing SDK, and tests under `dex/`. Website content and test-only mock contracts are not production components.

## Reporting a vulnerability

Do not publish an exploitable vulnerability in a public issue, discussion, or social channel. Use GitHub private vulnerability reporting when it is enabled for this repository. If it is unavailable, contact LQC through a verified official channel shown on the project website and request a private security contact before sharing technical details.

Include, where possible:

- affected commit, contract, function, and network;
- impact and required preconditions;
- reproducible steps or a minimal proof of concept;
- whether funds, permissions, accounting, or availability are affected;
- a proposed mitigation, if known.

Never test against third-party funds or production systems without explicit authorization.

## Implemented controls

- reviewed adapter registry and independent DEX disablement;
- minimum-output, deadline, and slippage limits;
- non-reentrant execution and atomic split rollback;
- exact temporary token approvals and post-execution balance checks;
- token allowlists and per-DEX, per-transaction, and UTC-day caps;
- timelocked structural changes and disable-only emergency guardians;
- dual-feed freshness and deviation checks for gas-cost conversion;
- rejection of unsupported fee-on-transfer inputs;
- deterministic invariant and failure-path tests.

## Production gates

Before mainnet use, LQC requires independent audits, expanded fuzz and invariant testing, verified deployment source code, final multisig and timelock assignments, production oracle configuration, capped-liquidity pilots, monitoring and incident procedures, and legal and regulatory review.

Security reports, tests, or repository activity do not constitute an audit or a guarantee that the software is free of vulnerabilities.
