# 76-17-⑥-⑤ / M15 — Isolated Futures core lifecycle integration

**Focused integration: 6/6 PASS in GitHub Foundry. Actual deployment and migration: BLOCKED.**

## Provenance

- Research test: `test/LQCFuturesMigrationM15CoreIntegration.t.sol`
- Isolated workflow: `.github/workflows/futures-m15-core-integration.yml`
- CI run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45048605405
- Test commit: `d0d49ef0ace307d6ccf08a075bb1b45289ec5c78`
- Compiler: Solidity 0.8.30 viaIR, optimizer 200, EVM Shanghai, scoped Foundry test.
- No production chain RPC, signer, transaction, old Vault setEngine, or actual token migration.

## Results

| Scenario | Isolated result | Key property |
| --- | --- | --- |
| M09 inherited separate stack | PASS | distinct Registry/Vault/Engine, old rights/custody unaffected by new-position open |
| M09 inherited legacy withdrawal after new activity | PASS | old user can withdraw 5000 synthetic tUSD, new-stack bookkeeping intact |
| M15 Fee/Insurance/Funding | PASS | 1% fee on 2000 synthetic USD notional, Insurance 12 units and Treasury 8 units, subsequent long funding debit of 2 units; legacy account unchanged |
| M15 Liquidation | PASS | synthetic long liquidation after oracle price fall, new OI/locked balance zero; old Vault assets unchanged |
| M15 Emergency HALTED | PASS | new market halted, new opens revert, no collateral mutation; old Registry remains ACTIVE |
| M15 Stale Oracle | PASS | stale mock quote prevents new position; collateral available and locked amounts unchanged |

## Interpretation and remaining blockers

The test demonstrates a *local synthetic isolation property*, not production safety or real price correctness. The historical known 5000 mUSDT account at BSC Testnet block 144115366 is distinct from the synthetic 5000 tUSD used in this test.

Not yet proven: full historical account inventory, live Oracle/proxy provenance, actual Safe ownership and multisig approvals, target chain deployed candidates, independent security review, open-position migration, complete Funding/ADL risk modeling, current Engine EIP-170/runtime size acceptance and supported real-chain deployment.

### Next real engineering priorities

- Extend isolated stateful regression to collateral conservation under randomized partial reductions/liquidations and funding settlements, including fee and debt reserve accounting.
- Constrain stateful actions to currently documented protocol invariants and report reproducible failures rather than silently loosening accounting requirements.
- Preserve M07 migration BLOCKED and M14 candidate not-run until actual independently verifiable inputs exist.
- Do not create new manifest-only PASS stages without concrete evidence.
