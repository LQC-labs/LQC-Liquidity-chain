# LQC Token Issuance Runbook

Status: testnet preparation only. Do not deploy this unaudited code to BSC mainnet.

## Fixed parameters

- Network standard: BEP-20/ERC-20 on BNB Smart Chain
- Name / symbol: Liquidity Chain / LQC
- Decimals: 18
- Maximum and initial supply: 1,000,000,000 LQC
- TGE circulating supply: 120,000,000 LQC (12%)
- Post-deployment minting: impossible
- Transfer tax, blacklist, administrator, proxy, pause: none
- Holder burn and approved `burnFrom`: enabled

The machine-readable source of truth is `config/tokenomics-12pct.json`.

## Required wallets

Create and independently verify eight beneficiary wallets. Treasury, liquidity,
community, development, growth, and partners should normally be multisignature
wallets. Team and investor beneficiaries must not share a signer quorum with the
treasury. Keep the deployer as a separate disposable hardware-wallet account.

1. Community
2. Liquidity and market making
3. Treasury
4. Team
5. Development and security
6. Growth and marketing
7. Strategic partners
8. Investors

Record wallet purpose, network, signer names, signing threshold, creation date,
and transaction links. Never store seed phrases or private keys in this repository.

## Safe order of operations

1. Obtain legal review of token classification, sale terms, sanctions/AML duties,
   marketing language, and eligible jurisdictions.
2. Freeze one tokenomics version across the whitepaper, website, listing forms,
   allocation JSON, and board/governance approval.
3. Create role-separated multisignature wallets and test every signer.
4. Commission independent audits of the token, vault, and deployment script.
5. Run the local compiler, allocation checker, and complete test suite.
6. Deploy on BSC Testnet (chain ID 97) with a future test TGE timestamp.
7. Verify source code on the testnet explorer and publish the test addresses.
8. Simulate the full TGE, vesting releases, burns, wallet loss, signer rotation,
   and accounting reconciliation.
9. Obtain written launch approval and a second-person address review.
10. Prepare a separate mainnet deployment script only after the audit findings
    are closed. Use a hardware-wallet deployer and an explicit chain-ID guard.
11. Verify mainnet source code before any exchange or public distribution.
12. Publish the contract, allocation wallets, vesting vaults, circulating-supply
    calculation, unlock calendar, and audit reports.
13. Transfer only the disclosed 120M TGE amount into publicly usable wallets.
14. Reconcile on-chain balances against the allocation file before opening trade.

## Included tools

```bash
cd dex
npm ci
npm run tokenomics:check
npm test
```

For BSC Testnet, copy `.env.token.example` to a local secret store, fill all
addresses and values, export them into the shell, then run:

```bash
npm run deploy:token:testnet
```

The testnet script refuses BSC mainnet, checks all beneficiary addresses,
deploys the fixed-supply token and eight vesting allocations, verifies that the
deployer retains zero LQC, and writes an address record under `deployments/`.

## Mainnet blockers

Mainnet issuance remains blocked until all of the following are complete:

- final tokenomics formally approved and public documents synchronized;
- all real multisignature addresses supplied and independently checked;
- legal opinion completed;
- independent smart-contract audit completed and findings closed;
- BscScan verification procedure rehearsed;
- exchange liquidity and market-making plan documented without price guarantees;
- incident response, key loss, and disclosure procedures approved.

