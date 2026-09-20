# LQC Lending Risk Engine Policy

Status: **Architecture Freeze approved design — implementation and pilot parameters remain subject to test, audit, governance, and legal review**

## Core rule

LQC Lending does not liquidate an account merely because a token price falls by a fixed percentage. Solvency is determined from collateral value, debt value, the configured liquidation threshold, and the account Health Factor.

`Health Factor = (Collateral Value × Liquidation Threshold) / Debt Value`

- Health Factor > 1: not liquidatable.
- Health Factor = 1: liquidation boundary.
- Health Factor < 1: liquidation may be executed subject to the market and protocol controls.

## Risk boundaries

- Protocol hard ceiling for Maximum LTV: **50%**.
- Initial controlled BSC pilot candidate: **50% Maximum LTV / 70% liquidation threshold / 5% maximum liquidation bonus**.
- These pilot values are not universal parameters for every future collateral market.
- Governance may configure stricter asset-specific parameters, but may not exceed contract-enforced hard ceilings without a separately reviewed code change.
- Supply caps, borrow caps, minimum borrow, oracle freshness/deviation, emergency controls, and market status are part of the market risk boundary.

## Liquidation

Partial liquidation is preferred over unnecessary full liquidation. The current implementation caps one liquidation at up to 50% of outstanding debt. A future audited version may use target-Health-Factor liquidation, provided it remains bounded and cannot seize more collateral than is available.

Residual debt after collateral exhaustion is recorded as bad debt. Reserve coverage, recapitalization, or bounded supplier-loss realization must remain explicit governance-controlled paths.

## Oracle

Lending must fail closed on stale, invalid, incomplete, or excessively divergent price data. A shallow LQC pool must not be the sole lending oracle. Collateral valuation uses the conservative side of validated price inputs and debt valuation uses the conservative higher side.

## Asset-specific policy

Volatile assets and stable assets must not be assumed to have identical risk. Every collateral/debt market requires reviewed volatility, liquidity, oracle quality, liquidation depth, and market-capacity limits.

## Documentation consistency gate

Before Release Candidate or CEX due diligence, the whitepaper, README, contract configuration, testnet manifests, website, token documentation, and exchange evidence package must describe the same approved risk model and must clearly distinguish protocol hard ceilings from active market parameters.
