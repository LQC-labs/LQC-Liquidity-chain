# LQC Full BSC Testnet E2E Design

Status: **Architecture Freeze G5 integration design — no deployment authorization**

## Goal

Produce one deterministic evidence bundle proving that the approved LQC modules interoperate without collapsing their accounting/failure boundaries.

This is not a single giant transaction. It is a gated scenario sequence using pinned contracts, actors, assets, configuration, transactions, receipts, state snapshots, and failure tests.

## Prerequisite gates

G5 execution is blocked until:
1. Router Proof verifier/Gateway deployment review is fresh and approved.
2. Lending Stage1-3 reuse contracts pass read-only runtime/config/binding revalidation.
3. Lending Stage4 receives a fresh isolated deployment packet; the legacy nonce-110 packet is never reused.
4. Futures deployed stack is reconciled to the pinned candidate commit.
5. Intent/Solver/Settlement candidate contracts and interfaces pass local integration/security gates.
6. Test actors, token addresses, balances, allowances, RPC endpoints, Safe roles and caps are frozen in an E2E manifest.

## Actors

Use role-separated actors:
- user/trader;
- Lending borrower/supplier;
- solver;
- dedicated deployment identity;
- Governance Safe;
- Risk/Guardian Safe;
- Treasury Safe.

Deployment identity must not be reused as a general Futures funding/trading wallet.

## Scenario order

### E2E-01 — Environment and evidence pin
Record chainId, block, pinned commit, artifact hashes, contract addresses/runtime hashes, Safe owners/thresholds, token decimals/balances, oracle configs, market caps, Router Registry state and all module versions.

### E2E-02 — LQC Flow baseline
Execute capped tLQC/WBNB buy and sell. Verify minOut/deadline, receipt status, balance deltas and residual allowances.

### E2E-03 — Router Best Execution
Quote at least two approved routes, prove candidate-set Best Execution, execute through ProofBoundExecutionGateway, verify consumed proof, selected adapter, output, zero residual allowance and replay rejection.

### E2E-04 — Vault/Liquidity
Deposit, account shares, route/strategy interaction if enabled, withdraw, cap rejection and shutdown/recall behavior. Verify conservation/invariants.

### E2E-05 — Oracle module isolation
Read the same economic asset through Lending and Futures oracle paths. Verify scale/freshness. Exercise stale/deviation failure locally or with controlled mocks; verify a Lending disable does not silently mutate Futures configuration and vice versa.

### E2E-06 — Lending
After fresh Stage4 completion only: configure capped market; supply; borrow within LTV; accrue interest; repay; withdraw; cross HF boundary in a controlled test; partial liquidation; bad-debt/reserve path where applicable. Verify 50/70/5 pilot config and caps.

### E2E-07 — Lending Supply Earn
Verify supplier index/rate accounting derives from borrow rate × utilization × (1-reserve factor). No fixed APY assertion.

### E2E-08 — LQC Staking
Only after Master 6/15+ implementation exists: stake; reward accrual/claim; cooldown; unstake; pause; budget accounting. Verify no mint above 1B and no Lending-balance contamination. Until then mark NOT EXECUTABLE, not failed.

### E2E-09 — Futures
Open capped position; verify margin/size/leverage/entry; funding accounting; reduce/close; liquidation guard; insurance/ADL/emergency controls as applicable. Verify Lending state is unchanged.

### E2E-10 — Same-chain Intent/Internal Solver
Submit signed Intent; verify expiry/replay rules; escrow/binding; execute approved Router path through Internal Solver; bind execution receipt.

### E2E-11 — Solver Network
After missing Master 9 gates are implemented: register/bond/capacity; competing quotes; risk-adjusted selection; assignment; reputation update only from verified outcome.

### E2E-12 — Settlement / Verification
Bind Intent → selected proof → transaction/receipt → finality. Reject replay/tamper. Exercise reorg/failure logic in deterministic simulation if BSC Testnet cannot safely induce it.

### E2E-13 — Governance/Risk emergency drill
Test module-specific pause first. Verify unrelated healthy modules remain available where policy allows. Then simulate a validated shared-dependency failure and coordinated Governance/Risk response.

### E2E-14 — Accounting reconciliation
Reconcile user balances, Vault shares, Lending cash/debt/reserves/bad debt, Futures margin/insurance, Staking budget, Treasury balances and protocol fees. No unexplained value creation/loss.

### E2E-15 — Evidence export
Produce machine-readable manifest with commit, chain, blocks, tx hashes, receipts, runtime hashes, state-before/state-after, expected vs actual, signer role, and PASS/FAIL per scenario.

## Failure policy

Any unexpected failure:
1. STOP dependent scenarios.
2. Record exact transaction/call, block, state and error.
3. Classify root cause: code / config / oracle / nonce / account / gas / external dependency / evidence.
4. Fix only the owning module or interface.
5. Run its regression suite.
6. Re-run the failed scenario and all downstream affected scenarios.
7. Never convert a failure to PASS by changing expected output after the fact.

## PASS semantics

- Local PASS != Testnet PASS.
- Module Testnet PASS != Full-System PASS.
- Full-System PASS != Security Audit PASS.
- Audit PASS != CEX listing approval.

## G5 exit

G5 architecture is resolved when this deterministic design is accepted. Actual Full BSC E2E execution belongs to Master 12 after the prerequisite modules reach their required implementation/deployment gates.
