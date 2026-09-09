# LQC Strategy Adapter V1

## Scope

Strategy Adapter V1 creates a narrow boundary between `LQCLiquidityVault` and a separately reviewed asset strategy. The first implementation is an idle, non-yielding adapter. It proves custody, accounting, role separation, allocation caps, recall, and emergency behavior without representing simulated yield as production revenue.

## Safety controls

- Governance approves exactly one vault-specific adapter.
- New vaults start with strategy allocations paused. Strategy changes are allowed only while allocations remain paused.
- An adapter must report the same asset and vault and must contain deployed bytecode.
- `strategyCap` limits absolute vault exposure. It defaults to zero.
- `maxLossBps` limits loss accepted during a normal recall and cannot exceed 20%.
- Unsolicited token donations are excluded from accounted idle assets and cannot be allocated as depositor capital.
- The strategy administrator may allocate and recall, but cannot approve adapters or expand limits.
- The pause administrator may stop allocations immediately and recall capital, but cannot resume allocations.
- When ownership changes, default administrators that still equal the previous owner follow the new owner automatically; explicitly separated pause and strategy administrators remain unchanged.
- Governance may perform an emergency recall with an explicit loss bound only after deposits and allocations are both paused.
- A strategy cannot be replaced while any recorded debt remains.

## Operational sequence

1. Governance deploys a vault-specific adapter and reviews its bytecode.
2. Governance reviews the adapter while allocations are paused and calls `setStrategy(adapter)`.
3. Governance sets a conservative `strategyCap` and `maxLossBps`.
4. Governance explicitly calls `resumeAllocations()` only after configuration and review are complete.
5. The strategy administrator allocates within the cap.
6. Monitoring compares `strategyDebt`, adapter-managed assets, actual balances, and emitted events.
7. Allocations are paused and all assets are recalled before changing or removing the adapter.

## Limitations

- V1 supports one strategy per vault.
- User withdrawals use idle vault liquidity; operations must recall strategy assets before large withdrawals.
- The idle adapter does not generate yield.
- Any external protocol adapter requires separate threat modeling, integration tests, testnet observation, and independent audit before production activation.
