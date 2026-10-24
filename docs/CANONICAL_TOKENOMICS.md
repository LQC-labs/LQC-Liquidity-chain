# LQC Canonical Tokenomics — V1.5 (BSC issuance recorded)

Status: **BSC mainnet initial issuance confirmed on 2026-10-24** by two independent read-only RPC checks (transaction receipt `status = 0x1`, matching runtime code, `totalSupply` and all nine allocation balances). **TGE, beneficiary distributions, Community 320M registration/funding, and native-mainnet migration are separate and not claimed complete.** The historical six-category / 15% Architecture Freeze design remains available in earlier commits.

## Fixed supply and chain strategy

- Symbol: **LQC**. Token name and decimals must be reported from the deployed contract's getters before public metadata is finalized; the former 18-decimal value was a design proposal.
- Initial deployed network: **BNB Smart Chain mainnet (chain ID 56)**; initial issuance confirmed on 2026-10-24.
- **Fixed initial and maximum issuance: 1,000,000,000 LQC**. No post-deployment discretionary token mint capability on BSC.
- Holder-authorized burning may permanently reduce supply; privileged unilateral seizure/burning is not authorized by this design.
- Future **LQC native mainnet** is planned using Cosmos SDK, CometBFT, Cosmos EVM and IBC. Native LQC shall support the fee/staking/validator security model, subject to further protocol decisions and independent security review.
- The fixed-supply promise is **global across the BSC and any future native mainnet representation**. Migration must not create duplicate redeemable or freely circulating LQC. A 1:1 migration, supported by provable BSC burn or irrevocable custody/lock and auditable mint/genesis/claim accounting on the destination, is a design goal, **not yet an implemented bridge or finalized redemption policy**.
- Validator/staking rewards come from pre-allocated budget, not inflation. Future network fee funding needs an approved economic model.
- The LQUSD 1:1 reserve-backed stablecoin is separate: the LQC security reserve is **not** a claim that LQUSD's backing has been funded.

## Allocation and official wallet labels

| Allocation | Designated wallet name | Share | Total LQC | Planned TGE release cap | Post-TGE plan |
|---|---|---:|---:|---:|---|
| Community | LQC Community Wallet | 40% | 400,000,000 | 80,000,000 | 320M capped monthly over 120 months; initial 80M subject to actual recipient distribution |
| Team & contributors | LQC Team Wallet | 20% | 200,000,000 | 0 | 12-month lock, 36 monthly vesting releases in months 13–48 |
| Existing investors | LQC Investor Wallet | 3.8% | 38,000,000 | 3,800,000 | 3-month lock, 24 monthly releases in months 4–27; existing contracts subject to legal validation |
| Liquidity & market making | LQC Liquidity Wallet | 8% | 80,000,000 | 60,000,000 | Remaining 20M subject to approved venue/liquidity mandates |
| Treasury & operations | LQC Treasury Wallet | 8.2% | 82,000,000 | 0 | Approved and disclosed operating budgets |
| Validators & staking | LQC Validator Wallet | 10% | 100,000,000 | 0 | Locked pending native-mainnet activation/settlement evidence; manual Safe-approved payouts for 10 years, capped at 10M per year, 2.5M per quarter, 100M lifetime |
| Ecosystem development | LQC Ecosystem Wallet | 5% | 50,000,000 | 0 | Milestone-driven ecosystem grants |
| Security & risk reserve | LQC Security Wallet | 3% | 30,000,000 | 0 | Multisig-approved security use; not LQUSD backing |
| Mainnet activation | LQC Mainnet Wallet | 2% | 20,000,000 | 0 | Stage-based use after mainnet launch; indicative 24 months |
| **TOTAL** | **9 allocation wallets** | **100%** | **1,000,000,000** | **143,800,000** | |

Management-wallet labels identify allocation authority, not beneficiary ownership or public circulation. The nine listed Safe recipients below each held the full allocated balance at the verification block. Reported Safe configuration was 2-of-3; independent control of individual signer keys and future Safe configuration changes were **not** established by the issuance transaction. Contract-enforced transfer restrictions and still-pending operational funding must be described separately.

## Confirmed BSC mainnet issuance (2026-10-24)

- Transaction: [0x0172ef5f6855bf6f80fd19a7f9539f7a745088d7dec253f6d388ff65d4b89ce3](https://bscscan.com/tx/0x0172ef5f6855bf6f80fd19a7f9539f7a745088d7dec253f6d388ff65d4b89ce3), block **129416178**, receipt **status 0x1**.
- Deployed LQC contract: [0x6d6e197376195c7369C3c5F65e3685629F59025a](https://bscscan.com/address/0x6d6e197376195c7369C3c5F65e3685629F59025a); deployer: `0x043697Dd5b6142568aB06999B8E3c9057916e954`.
- Two read-only RPC providers independently returned the same receipt, **16,904-byte runtime** matching the final candidate including immutable values, `totalSupply() = 1,000,000,000 LQC`, and all nine initial Safe balances (checked at block **129417644**). These results were reported from the preserved local issuance verification evidence.
- The initial issuance minted exactly 1B to the following nine **management Safe wallets**, not directly to end-user beneficiaries:

| Allocation | Initial on-chain balance (LQC) | BSC recipient Safe |
|---|---:|---|
| Community | 400,000,000 | `0xaab6126bc808b4823a400fd6efc307bd1aa5d9aa` |
| Team | 200,000,000 | `0x12b375ede9d98300aee4d9fe16d34745ec81d72f` |
| Investor | 38,000,000 | `0xadd957e343a73ca9f9ea77dd0aeec253ab28c05f` |
| Liquidity | 80,000,000 | `0x8efdab44e695adb83f6a136f63bcdf08f362ae55` |
| Treasury | 82,000,000 | `0x92e0a8dfa052055d9469c6383a252061901e32e4` |
| Validator | 100,000,000 | `0xd2a10067f125e6b6e7dd4c31deb376a6347aaf06` |
| Ecosystem | 50,000,000 | `0xc263eae7a51e72cdcc9af17b8b37855be10c9bbe` |
| Security | 30,000,000 | `0x9d464de7e4985e1a744adda179bd69d4d7a4f943` |
| Mainnet | 20,000,000 | `0xd0d3e5abec326301387e275f6267cc3fe4c95b53` |
| **TOTAL** | **1,000,000,000** | **9 Safe wallets** |

**Verification boundary:** This establishes initial on-chain allocations at the stated block, not current balances for all future times, beneficial ownership, completed vesting-funding operations, CEX listing or circulating supply.

## TGE inventory and actual circulating supply

- **Planned TGE public-release budget** = up to 143,800,000 LQC **(14.38% of initial 1B)**: Community up to 80,000,000, Investors up to 3,800,000, Liquidity up to 60,000,000. This is a distribution plan, **not** an on-chain measurement of currently transferable wallet inventory or actually circulating tokens.
- The 143.8M figure is **not confirmed circulating supply**. The initial mint allocated all 1B tokens to nine Safe wallets, but neither a Safe balance nor the technical ability to transfer tokens proves public distribution or market float. Locked/unfunded Community balances, investor vesting, team restrictions and any other wallet permissions require separate, timestamped treatment.
- Publish actual transferability, relevant wallet addresses, escrow/vesting balances, total supply, locked balances, DEX/CEX liquidity inventory and a timestamped circulating-supply calculation before public claims or exchange submission.
- The planned TGE reference time is **2027-02-01 09:00 KST**. Operational beneficiary eligibility and distribution restrictions remain separate decisions. Community 320M registration and exact funding must be completed **before** this time; they were **not** part of the 2026-10-24 mint.

## Vesting calendar (TGE = month 0)

- **Community:** 400M was initially minted to its Safe. Up to 80M is designated for early distribution; the remaining **320M** is subject to the separately tested 120-month program and must be registered and funded before TGE (in this order: verify recipient/contract, register, approve exactly 320M, fund, verify final balances/status). On-chain Community registration/funding was **not verified complete** as of issuance. Actual circulation requires transfers to eligible recipients; unlocked/unclaimed balances are not automatically circulating.
- **Team:** TGE 0; **12-month lock**, then 200M released in **36 monthly installments** during months 13–48. Remainders adjusted in the last tranche. Early withdrawal is prohibited absent separately disclosed and reviewed policy.
- **Investors:** Up to 3.8M at TGE (10% of 38M). Remaining **34.2M** locked through months 1–3, then **1,425,000 LQC every month in months 4–27** (24 releases). Investor-by-investor contracts and amendments must be legally confirmed before deploying vesting terms.
- **Validators & staking:** **100M remains locked** pending official LQC native-mainnet activation and validated BSC/native supply-conservation and settlement rules. The approved payout ceiling is **10 years**, **10M LQC per year**, **2.5M per quarter**, and **100M total**; payouts are manual only, require Validator Safe **2-of-3** approval and a registered operator recipient. Activation proof/time, calendar periods, carryover, native settlement and year-10 remainder handling have **not** been finalized and must not open payout authority until resolved. No new mint authority.
- **Other categories:** Liquidity 20M residual only under verifiable mandates; Treasury 82M, Ecosystem 50M and Security 30M according to approved budgets/controls; Mainnet activation 20M phased after launch (indicative 24 months). These are **not automatically circulating at TGE**.
- Calendar boundaries, leap-day behavior, release precision, rounding, and revocability must follow the deployed contract where applicable; remaining operating-policy choices must be approved before the affected withdrawals. Do not treat design-only schedules as evidence of actual released balances.

## Post-issuance operations and disclosure controls

1. **Initial mint completed:** BSC mainnet transaction, matching runtime code, exactly 1B initial supply and nine Safe allocation balances were confirmed on 2026-10-24. Preserve the receipt and build/bytecode evidence; do not repeat deployment. `dex/contracts/testnet/LQCTestToken.sol` remains **testnet-only**, not the deployed production token.
2. **Wallet governance:** Validate actual signer control and periodically recheck Safe owners, threshold, modules, guard and proxy implementation before material distributions. Never commit seed phrases/private keys.
3. **Community 320M:** Confirm contract identity and register/approve/fund/verify the exact locked budget **before 2027-02-01 09:00 KST**. Minting to the Community Safe does not establish completion of this funding workflow.
4. **Investor and Team beneficiaries:** Verify actual owner/beneficiary control, vesting entitlements and restrictions before individual transfers. A mint into their management Safes is not a beneficiary payout.
5. **Validator/native migration:** Keep the 100M locked until activation and settlement conditions are approved/verified; prevent any additional freely redeemable supply across BSC and the future native chain.
6. **Public disclosures:** Reconcile README, whitepaper sources/PDF, website and other active tokenomics statements before publishing updates. Review investor terms and distribution requirements before CEX submissions. Distinguish minted supply, transferable inventory, planned TGE release and actual circulating supply.
7. **Claim discipline:** Do not claim an exchange listing, regulator endorsement, third-party review completion, beneficial distribution or public circulation without corresponding evidence. The production deployment record does not by itself establish those facts.

## Change history and supersession

- Historical Architecture Freeze baseline: **1B total, six allocation groups, TGE 150M/15%**, without a current 3.8% investor category. Retained as history in earlier commits and freeze records.
- **2026-10-21 V1.4 project-owner-approved design:** nine categories including 3.8% existing investors, community 40% over 10 years, maximum planned TGE 143.8M/14.38%, explicit mainnet portability and fixed-supply migration constraint.
- **2026-10-24 V1.5 proposed disclosure update:** records the confirmed BSC deployment, nine funded management Safes and the approved 10-year Validator ceiling; distinguishes TGE/Community operational tasks from initial issuance. This version becomes the current canonical repository disclosure **only after PR review and merge**.
