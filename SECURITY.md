# LQC Security Policy and Review Status

## 1. Security Status

The LQC Flow DEX and Router 2.0 code is an **unaudited MVP** intended for local development and controlled testnet evaluation. It must not be used with production funds. No independent audit, formal verification, bug bounty, or production deployment is currently claimed.

## 2. Implemented Controls

### Transaction safety

- User-specified minimum output and transaction deadline
- Actual output measured by contract balance delta
- Entire transaction reversion when output is below the global minimum
- Input, output, candidate-count, route-length, and allocation validation
- Split allocations must be non-zero and total exactly 10,000 basis points
- Refund of unused token or wrapped-native input

### External integration controls

- Owner-managed adapter allowlist
- Disabled or reverting adapters skipped during best-route quotation
- Split execution rejects any disabled adapter
- Adapter swap entry points restricted to the configured aggregator
- Route endpoint and path validation in the Uniswap V2-compatible adapter
- Temporary token approvals cleared before and after use

### Contract controls

- Reentrancy locks on state-changing pair and Router 2.0 swap functions
- Two-step ownership transfer
- Safe ERC-20 transfer wrappers supporting tokens that return no value
- Native BNB accepted by Router 2.0 only from configured WBNB
- Limits of 16 best-route candidates, 8 split routes, and 5 addresses per compatible-adapter path

### Test coverage currently exercised

- Expired transaction rejection
- Slippage/minimum-output enforcement
- Owner-only adapter management
- Disabled and reverting adapter behavior
- Dishonest adapter overstatement detection through actual output measurement
- Invalid split allocations and route rejection
- Unsolicited native-BNB rejection
- Native wrapping/unwrapping flows
- AMM liquidity, exact-input, exact-output, and multi-hop behavior
- Route optimizer failure handling, path limits, gas adjustment, and split selection

## 3. Known Limitations

- No independent audit or formal verification
- No invariant or fuzz-testing suite yet
- No live BSC testnet deployment evidence or verified production address
- Single owner controls the current Router 2.0 adapter allowlist
- No timelock, multisig enforcement, or emergency pause in current Router 2.0 code
- No token/pool risk registry beyond the adapter allowlist
- Fee-on-transfer, rebasing, ERC-777-style callback, and other non-standard tokens are not supported or certified
- Browser quote comparison does not guarantee execution price; state can change before mining
- Browser split selection uses a heuristic threshold; its displayed network fee uses the live gas price with a route-complexity gas-unit estimate rather than transaction simulation
- Price impact is an estimate derived from a small proportional quote and is not an oracle or execution guarantee
- Native-BNB split execution is not implemented
- External DEX, RPC, wallet, MEV, and network risks remain outside the contracts' control

## 4. Required Production Gates

Production use requires, at minimum:

1. Threat modeling and documented trust assumptions
2. Expanded unit, integration, invariant, fuzz, and fork testing
3. Reputable independent smart-contract audit
4. Remediation and public verification of material findings
5. Multisig ownership and timelocked privileged operations
6. Function-level emergency controls with transparent operating policy
7. Adapter, token, pool, and DEX due diligence
8. Monitoring for failed swaps, unusual approvals, balance changes, and privileged events
9. Incident-response and disclosure procedures
10. Capped testnet and pilot limits before broader liquidity deployment

## 5. Responsible Disclosure

Do not disclose an unpatched vulnerability publicly or test it against real users or funds. Submit a private report to the project through a verified contact channel published on the official LQC website or repository profile. A useful report should include:

- affected contract, function, branch, and commit;
- clear impact and preconditions;
- reproducible steps or a minimal proof of concept;
- suggested mitigation, if available; and
- a safe contact method for follow-up.

The project should acknowledge valid reports, triage severity, coordinate remediation, and publish an appropriate post-remediation disclosure. A dedicated security mailbox and bug-bounty program remain pending and must be established before production release.

## 6. No Warranty

The repository is provided for technical review and testing without warranties. Passing automated tests does not establish the absence of vulnerabilities, economic exploits, integration failures, or regulatory risk.
