# LQC Router 2.0 — Risk Controls Review Note

Status: **unaudited testnet MVP**. This document describes implemented controls; it is not an audit report or a mainnet-readiness claim.

The emergency controller uses a two-step ownership transfer. The current owner nominates a pending owner, and only that address can accept control. Guardian membership remains an explicit, separately managed emergency role.

## Control model

- The protocol governance proposer is intended to be a 4-of-7 Safe multisig.
- Registry and risk-parameter expansions execute only through `LQCTimelockController` after the configured delay. The target production policy remains 48 hours; the bootstrap default is one hour for testnet exercises.
- The risk administrator is intended to be a separate 3-of-5 Safe multisig. It can only reduce active token limits.
- Emergency guardians can disable a DEX route or pause all new swaps immediately. They cannot resume swaps, re-enable routes, change adapters, move user funds, mint tokens, or expand limits.

## Safe incident response

Monitoring never submits a transaction automatically. A Safe policy breach produces an ordered
response plan: guardian-multisig pause, evidence preservation, Safe remediation, timelocked recovery,
and post-recovery validation. A signer change that does not weaken the threshold produces a review
workflow and cannot become the new deployment baseline without a verified governance approval.

## Enforced swap checks

`LQCRiskRegistry` rejects execution unless:

1. both input and output tokens are allowlisted;
2. every selected DEX has a non-zero cap for the input token;
3. every route allocation is within its DEX/token cap;
4. the complete order is within the token's per-transaction cap; and
5. the token's cumulative input volume remains within its UTC-day cap.

Split orders are checked as one complete order, preventing a caller from bypassing the per-transaction cap by dividing an order across routes.

## Parameter policy

Repository defaults are test-only examples. Final token lists and numeric caps require BSC testnet measurements and risk-committee approval based on liquidity depth, execution reliability, oracle quality, security history, audit history, and operational monitoring. The risk multisig may immediately reduce existing token or DEX/token caps, but it cannot create or expand permissions; those changes remain timelocked governance actions.

## Mainnet gates

Do not activate user funds until independent review is complete, Critical/High findings are resolved, role assignments and multisig signers are published, pause/recovery drills pass, monitoring is active, and capped-pilot accounting shows no mismatch.
