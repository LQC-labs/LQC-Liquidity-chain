# Master 4/4 — Strategy Adapter Identity / Version Metadata

Implements the P1 gap classified in 4/2 without changing strategy accounting.

- `ILQCStrategyAdapter` now exposes `adapterId()` and `adapterVersion()`.
- The reference idle adapter reports stable ID `keccak256("LQC_IDLE_STRATEGY")` and version `1`.
- Metadata is pure/read-only and cannot allocate, recall, or move funds.
- Future chain/protocol adapters must provide explicit identity/version evidence before review.

`activationAuthorized: false`
