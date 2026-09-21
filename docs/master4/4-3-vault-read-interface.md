# Master 4/3 — Vault Read Interface and Available Liquidity

Implements the two P0 gaps classified in 4/2.

- Adds `ILQCVaultRead`, a narrow read-only integration surface.
- Adds `availableLiquidity()`, returning the lower of accounted idle assets and actual token balance.
- Unsolicited token donations cannot inflate liquidity advertised to consumers.
- No mutation authority is exposed by the interface.
- Existing deposit/withdraw/strategy accounting is unchanged.

`activationAuthorized: false`
