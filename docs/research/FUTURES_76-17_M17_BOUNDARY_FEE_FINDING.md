# 76-17-⑥-⑤ / M17 — Futures partial-liquidation, funding and fee rounding boundary

**Status: FOCUSED FOUNDRY 14 PASS / 0 FAIL, with an OPEN ECONOMIC FEE-SPLITTING FINDING.** Never interpret a positive regression of a defect as its remediation.

## Evidence

- Test file: `test/LQCFuturesMigrationM17Boundary.t.sol`
- Focused CI: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45050077733 — SUCCESS (14 tests, 0 failures).
- Corrected test commit: `79a6a65c42ae4cb96283de171929cf03683a2f18`.
- First run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45049996261 — 13 PASS / 1 FAIL. Test had assumed every repeated partial liquidation remains liquidatable after prior reductions; the final attempt correctly reverted `NotLiquidatable()`. Corrected test checks equity relative to maintenance margin before each liquidation and confirms that at least one partial liquidation was exercised.
- Solidity 0.8.30 viaIR optimizer 200, isolated Foundry mock assets and price feed, no chain interaction or production change.

## New M17 scenarios

1. **Dust reduction rejected:** 100 base-unit notional with margin 20 base units; reducing 1 unit yields zero proportional margin and correctly reverts `InvalidReduction`. User available/locked, fee reserves and OI remain unchanged.
2. **Repeated partial liquidation:** after adverse mock long price movement (50,000→38,000) and configured 50% reduction, liquidation is repeated only while the position meets actual maintenance-margin criteria. Each executed step decreases OI, preserves segregated Vault ledgers and leaves the historical synthetic Vault untouched.
3. **Fractional Funding:** with position notional `3e18` and 4 index updates of `1e8` ray, fractional Funding carries across checkpoints into 1 base unit; repeating the same checkpoint causes no second debit. Underlying pool/user accounting reconciles.
4. **Zero Insurance coverage:** on an adverse full liquidation with 500-unit synthetic deficit, 0% coverage leaves all 12 fee-derived Insurance units segregated and records **500 units of residual bad debt**; `isSolvent` reports false.
5. **Confirmed fee rounding/splitting design risk:** at 1% fee and 100 base-unit position, the initial open fee is 1 unit. Twenty reductions of 5 base units each incur `floor(5*100/10000)=0` fee per reduction, hence the reduction-fee aggregate is **zero**, although a single 100-unit reduction would generate `floor(100*100/10000)=1` unit. The test intentionally asserts the problematic behavior to preserve reproducibility. This is a **OPEN ECONOMIC FINDING**, not a fee-accounting PASS.

## Engineering decision

**Do not mark Futures economic readiness PASS.** Prioritize fee rounding policy/design correction before any main deployment or market activation. Options requiring independent review include:
- accumulative fee remainder tracking per account/market (avoid per-operation truncation evasion);
- enforce dust/order-size bounds after accounting for token decimals and product precision;
- policy-specific minimum fee or round-up (must carefully avoid disproportionate charges, denial-of-service, griefing, or user rights violations);
- regression prove equivalence between one whole reduction and many split reductions at the same price, including Insurance/Treasury share rounding.

Do not silently implement an economic policy change without an approved specification. The current scope is test/research only.

## Unchanged blockers

- PR #460 remains Draft with independent security review missing.
- M07 complete migration, M14 new live-stack independent evidence, Oracle/production custody, and real contract deployment remain BLOCKED or NOT_RUN.
- Existing historical BSC testnet Vault user rights (M08 known 5000 mUSDT at frozen block) not moved. The M17 100-unit boundary is synthetic mock token base units, not market-notional USD.
