# Master 6/19 — Lending + Earn + LQC Staking E2E

Status: **Stage 6 repository integration exit gate**

## Purpose

Close the Stage 6 repository-development sequence by proving that the existing Lending Core, borrower-interest-driven Supply Earn, and the canonical LQC Staking stack can operate together without sharing unsafe accounting or custody.

This gate reuses the already completed 6/13–6/18 components. It does not create a second Earn vault or merge LQC Staking into Lending Core.

## Integrated path

The E2E gate exercises:

1. Lending supplier deposits the debt asset;
2. borrower deposits collateral and borrows;
3. borrower interest accrues;
4. supplier claim increases through the Lending supply index;
5. protocol reserve accrues separately;
6. user stakes LQC in the canonical Staking Vault;
7. Governance-funded, pre-funded variable LQC rewards accrue in the separate Reward module;
8. user claims Staking rewards without consuming staking principal;
9. borrower repays and exits collateral;
10. Lending supplier withdraws principal plus variable earned interest;
11. staker requests unstake, enters cooldown and withdraws exact principal;
12. Staking emergency pause/funding pause does not stop healthy Lending operations;
13. emergency Staking exit remains user-controlled and non-custodial.

## Accounting invariants

- Lending Core does not custody LQC staking principal.
- Staking Vault does not custody Lending debt assets.
- Reward custody is separate from staking principal custody.
- Supply Earn is borrower-interest-driven, not paid from Staking rewards.
- Staking rewards do not mask Lending bad debt or reserves.
- Staking emergency controls do not pause or mutate healthy Lending state.
- No contract gains LQC mint authority through this integration.

## Stage 6 exit meaning

Passing 6/19 means:

**LENDING + SUPPLY EARN + LQC STAKING REPOSITORY E2E PASS**

It does not mean:
- Staking contracts have been deployed to BSC Testnet;
- a staking reward budget has been economically approved;
- Lending Governance configuration or market activation has executed;
- independent security audit has completed;
- production/mainnet release is authorized.

Those remain separate evidence and later Master gates.

## Future Earn expansion

The integrated architecture intentionally leaves room for future USDT/USDC Locked Earn:

**Unified Earn UI / Registry → Lending Supply Earn | LQC Staking | future asset-specific Locked Earn**

Future stablecoin Locked Earn modules must remain separate custody/accounting domains and should integrate through reviewed interfaces rather than modifying LQC Staking principal custody.

## Next Master stage

After this repository gate passes, the next executable Master stage is:

**MASTER 7/15 — Futures**

Master 7 begins with latest-main regression and selective reuse of the already implemented/testnet-verified Futures foundations. Historical Futures PRs are reviewed selectively; they are not merged wholesale merely because Stage 7 opens.
