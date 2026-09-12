# LQC DEX Stage 1 → Stage 2 Handoff Checklist

Status: Testnet MVP preparation only

This checklist records the evidence boundary between repository validation and BSC testnet deployment. Passing Stage 1 does not authorize deployment.

## Stage 1 repository gate

Run from `dex/`:

```bash
npm run gate:stage1
```

Required checks:

- Browser application syntax
- Solidity compilation and complete contract/security suite
- Router SDK coverage threshold

Required safety conditions:

- No production funds
- No mainnet deployment
- No private key committed to the repository
- Deployment source commit must be pinned and clean
- Router, Vault, Strategy, Registry, Risk, Pause, and Timelock controls remain covered by tests

## Stage 2 deployment prerequisites

Deployment remains blocked until all reviewed operational inputs exist:

- BSC Testnet chain ID 97 and validated RPC
- Full 40-character reviewed source commit
- Deployer runtime key supplied outside the repository
- Governance owner / Protocol multisig
- Separate Risk multisig
- Guardian multisig
- Treasury multisig
- WBNB and approved DEX endpoint addresses
- PancakeSwap V3 Quoter and Router pair
- Reviewed V3 fee tiers and pool allowlist
- Maximum V3 hop limit
- Minimum deployer tBNB reserve
- Deployment and operation checkpoint path

## Stage 2 evidence to collect

After an approved testnet deployment:

1. Confirm every contract has bytecode on chain.
2. Confirm chain ID, source commit, constructor configuration, and role separation.
3. Confirm Safe owner counts and thresholds.
4. Confirm Registry, Risk Registry, Vault, and adapter ownership is transferred through Timelock.
5. Confirm route quotes for approved LQC Flow and PancakeSwap paths.
6. Confirm bounded smoke swaps using test tokens only.
7. Confirm emergency pause blocks new swaps while recovery paths remain available.
8. Confirm checkpoint replay reuses canonical successful receipts and fails on reorg or configuration mismatch.
9. Publish deployment record and verification artifacts.
10. Obtain operational sign-off before any capped public pilot.

## Explicit non-goals

This handoff does not claim:

- Independent audit completion
- Mainnet readiness
- Live liquidity
- CEX listing
- Gasless sponsorship completion
- Lending or cross-chain production readiness

Gasless remains a later isolated stage. Lending and cross-chain expansion remain blocked until their separate security and economic evidence is complete.
