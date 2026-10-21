# LQC Canonical Tokenomics — V1.4 (approved design)

Status: **Project-owner-approved 2026-10-21 design; implementation and on-chain issuance pending.** This proposed canonical revision supersedes the previous 6-category / 15% Architecture Freeze disclosure when merged. Existing historical records remain intact. Approval of this design is NOT evidence that tokens have been deployed, audited, freely distributed or listed.

## Fixed supply and chain strategy

- Symbol: **LQC**. Final public display name and decimals are to be verified before deploying (18 decimals proposed).
- Initial intended network: **BNB Smart Chain mainnet (chain ID 56)**.
- **Fixed initial and maximum issuance: 1,000,000,000 LQC**. No post-deployment discretionary token mint capability on BSC.
- Holder-authorized burning may permanently reduce supply; privileged unilateral seizure/burning is not authorized by this design.
- Future **LQC native mainnet** is planned using Cosmos SDK, CometBFT, Cosmos EVM and IBC. Native LQC shall support the fee/staking/validator security model, subject to further protocol decisions and independent security review.
- The fixed-supply promise is **global across the BSC and any future native mainnet representation**. Migration must not create duplicate redeemable or freely circulating LQC. A 1:1 migration, supported by provable BSC burn or irrevocable custody/lock and auditable mint/genesis/claim accounting on the destination, is a design goal, **not yet an implemented bridge or finalized redemption policy**.
- Validator/staking rewards come from pre-allocated budget, not inflation. Future network fee funding needs an approved economic model.
- The LQUSD 1:1 reserve-backed stablecoin is separate: the LQC security reserve is **not** a claim that LQUSD's backing has been funded.

## Allocation and official wallet labels

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

Management-wallet labels identify allocation authority, **not** proof of funded on-chain balances. Audited vesting/distribution smart contracts, rather than unrestricted category wallets alone, should hold restricted tokens. Proposed multisig threshold/signers and all nine final wallet addresses remain subject to verification.

## TGE inventory and actual circulating supply

- **Maximum targeted initial transferable allocation** = 143,800,000 LQC **(14.38% of 1B)**: Community up to 80,000,000, Investors up to 3,800,000, Liquidity up to 60,000,000. Team and other categories receive 0 at TGE.
- The 143.8M figure is a **planned maximum, NOT confirmed free circulation**. Unclaimed community tokens, yet-to-be-delivered investor amounts, undeployed or contract-restricted market-maker inventory and any other restricted amounts are not automatically circulating.
- Publish actual transferability, relevant wallet addresses, escrow/vesting balances, total supply, locked balances, DEX/CEX liquidity inventory and a timestamped circulating-supply calculation before public claims or exchange submission.
- TGE timing, restricted-jurisdiction and beneficiary eligibility rules are pending legal/operational review.

## Vesting calendar (TGE = month 0)

- **Community:** Up to 80M allocated for initial distribution. Remaining **320M** authorized as monthly capped programs over **120 months** (months 1–120), averaging 2,666,666.666… LQC/month, with integer-unit rounding in the last period. Budget eligibility and anti-Sybil/anti-wash-trading checks control actual claims; unlocked/unclaimed amounts are not necessarily circulating.
- **Team:** TGE 0; **12-month lock**, then 200M released in **36 monthly installments** during months 13–48. Remainders adjusted in the last tranche. Early withdrawal is prohibited absent separately disclosed and reviewed policy.
- **Investors:** Up to 3.8M at TGE (10% of 38M). Remaining **34.2M** locked through months 1–3, then **1,425,000 LQC every month in months 4–27** (24 releases). Investor-by-investor contracts and amendments must be legally confirmed before deploying vesting terms.
- **Validators & staking:** up to 100M from its existing allocation over a target **96 months after native mainnet start**, with details dependent on fee economics, validator policy, and governance; no new minting authority.
- **Other categories:** Liquidity 20M residual only under verifiable mandates; Treasury 82M, Ecosystem 50M and Security 30M according to approved budgets/controls; Mainnet activation 20M phased after launch (indicative 24 months). These are **not automatically circulating at TGE**.
- Calendar-month handling, leap-day behavior, release precision, rounding and any revocability rights need implementation tests and explicit disclosure.

## Deployment and external-review prerequisites

1. Record and verify all nine BSC public wallet addresses and actual independent signer/threshold arrangements; never commit seed phrases/private keys.
2. Implement and independently audit fixed-supply ERC-20, holder-authorized burn and lock/distribution contracts. The testnet-only owner-mintable `dex/contracts/testnet/LQCTestToken.sol` is **not** an acceptable production token.
3. Validate allocation sums, balance conservation, cliffs, 120-month community program, 24-month investor releases, 36-month team releases and last-tranche precision.
4. Review existing investor contracts, token characterization, jurisdictional requirements and KYB/KYC before distribution or CEX submission.
5. Reconcile README, canonical whitepaper source, regenerated PDF, website/lqc.network disclosures, reward-source policy, issuance artifacts and CEX evidence to this version. The current PDF generator may still reflect the old 15% design and must be updated/reviewed separately **before any new PDF is published**.
6. Establish and audit a separate native-mainnet migration specification, enforce no double supply and state how future validators will be compensated sustainably.
7. Do not represent the token as launched, audited, listed, approved by regulators or actually circulating without evidence.

## Change history and supersession

- Historical Architecture Freeze baseline: **1B total, six allocation groups, TGE 150M/15%**, without a current 3.8% investor category. Retained as history in earlier commits and freeze records.
- **2026-10-21 V1.4 project-owner-approved design:** nine categories including 3.8% existing investors, community 40% over 10 years, maximum planned TGE 143.8M/14.38%, explicit mainnet portability and fixed-supply migration constraint.
- This revision becomes the current repository canonical disclosure **only after review and PR merge**. Neither revision is proof of on-chain launch.
