# LQC Staking Reward Source and Economic Boundary

Status: **Architecture Freeze G4 design decision**

## Objective

Add LQC Staking utility without:
- increasing the fixed 1,000,000,000 LQC supply;
- contaminating Lending accounting;
- creating an undisclosed circulating-supply path;
- promising unsustainable fixed yield;
- consuming Team, Treasury, Liquidity/MM, Community or Grants allocations outside approved purposes.

## Two reward domains

### A. Token-emission rewards

Token-denominated rewards may be funded only from a disclosed, governance-approved budget that already exists inside canonical tokenomics.

The preferred candidate domain is a formally earmarked sub-budget of **Future Ecosystem Rewards (35% / 350M LQC)**. This is a candidate source, not an authorization to allocate all 350M to staking.

Before activation, Governance must approve:
- exact staking reward budget;
- start/end or epoch schedule;
- maximum distribution rate;
- source wallet/vault;
- vesting/streaming or immediate-claim treatment;
- unused-budget return path;
- circulating-supply treatment;
- emergency stop authority.

No staking contract receives mint authority above the fixed supply.

### B. Protocol-revenue rewards

A separate reward stream may distribute a governance-approved portion of realized protocol revenue.

Revenue rewards:
- are accounted separately from token emissions;
- depend on actual realized revenue and distributable reserves;
- are variable and not guaranteed;
- cannot spend user deposits, borrower principal, Lending reserves required for solvency, Futures margin/insurance assets, or protected Treasury balances.

## Lending separation

LQC Staking Vault is not Lending Core:
- staking deposits are not Lending supply;
- staked LQC is not automatically Lending collateral;
- staking rewards do not mask Lending bad debt;
- Lending Supply Earn remains borrower-interest-driven;
- Staking reward accounting and Lending interest accounting are independently auditable.

## Reward-rate policy

Architecture Freeze does **not** set a headline APY.

The implementation must support bounded governance parameters such as:
- reward budget;
- emission rate per epoch;
- program end;
- per-program cap;
- claim accounting;
- cooldown/unstake;
- emergency pause.

Displayed APY/APR, if any, is calculated from current reward rate and eligible staked balance and is explicitly variable.

## Circulating-supply reconciliation

For every reward epoch:

opening reward budget
- distributed/claimable rewards
- returned/expired rewards
= remaining controlled budget

CEX/public circulating-supply reporting must define when rewards become circulating and reconcile to source balances and on-chain distribution records.

## Safety / Insurance Staking

Safety/Insurance Staking remains a separate future product. Ordinary LQC Staking does not expose stakers to Lending/Futures bad debt by default. Any future loss-bearing/slashing mechanism requires:
- separate vault/accounting;
- economic simulation;
- explicit loss waterfall;
- user disclosure;
- legal review;
- independent audit;
- Governance approval.

## Mainnet portability

Reward source, accounting, epoch policy and claim state are Core economic concepts. Chain-specific token addresses, distribution adapters, and revenue assets remain configuration/adapters so the model can migrate to a future LQC Mainnet.

## G4 exit

Architecture G4 is resolved at design level:
- fixed supply remains 1B LQC;
- Future Ecosystem Rewards is the preferred token-emission source candidate, subject to a separately approved sub-budget;
- realized protocol revenue is a separate variable source;
- no guaranteed APY;
- Lending/Staking accounting remains separate;
- Safety Staking is post-pilot scope.

Exact reward budget and emission curve remain an economic/governance decision before Master 6/15-6/19 implementation and are not invented during Architecture Freeze.
