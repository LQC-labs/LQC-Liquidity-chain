# LQC CURRENT STATE

Canonical plan: `docs/LQC_MASTER_DEVELOPMENT_PLAN.md`

- Current work unit: **1/4 — Lending test audit**
- Status: **ACTIVE**
- Verified baseline main: `5e0417d2313f7e11f3254bdbe2c5bc68b88d321d`
- Baseline CI: LQC DEX CI PASS; DEX tests PASS
- Official Lending baseline candidate: `dex/contracts/lending/LQCLendingCore.sol`
- PR #70: HOLD — separate SupplyVault may duplicate current Lending Core custody/accounting; review under 1/5 only.
- Intent PR #63/#64: FROZEN during section 1 reconciliation.
- Futures PR #69: FROZEN during section 1 reconciliation.
- Deployment rule: no deployment, wallet signature, token movement or testnet transaction during repository reconciliation.

## Next required action
Complete 1/4 by mapping existing Lending tests against:
1. collateral deposit/withdraw
2. liquidity supply/withdraw
3. borrow
4. repay
5. interest/index accrual
6. oracle/LTV/health factor
7. liquidation
8. bad debt/reserves/supplier loss
9. reentrancy, exact-transfer, cap and boundary/invariant safety

Do not advance to 1/5 until this audit is recorded.
