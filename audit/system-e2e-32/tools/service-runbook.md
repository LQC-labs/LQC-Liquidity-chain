# SYSTEM-E2E-32 stage 102 — shared deployment recovery

Use one protected journal and an exclusive OS lock per deployment plan. Pin the chain ID, genesis, baseline block and reviewed ordered steps. Append downstream steps only after their inputs and constructor addresses are resolved. The journal commits to the exact published prefix and revalidates completed receipts before accepting an append. Keep the plan producer separate from the broadcaster and restrict writes to both files.

For each creation, pin sender, nonce, predicted address, full initcode, constructor inputs and expected runtime hash with immutable values resolved. For a Safe call, pin the relayer nonce, Safe nonce, exact calldata and Safe transaction hash. Confirm receipt block canonicality and finality, runtime and the Safe success event. Snapshot the completed evidence before proceeding. A prepared step is never resent automatically. If history is incomplete, a conflicting transaction is encountered, or more than 256 block positions would be needed, stop for operator reconciliation. Never delete a prepared record to bypass the stop. A leftover temporary file from an interrupted atomic write does not replace the canonical record.

| Service | Apply journal to | Remaining dependency |
|---|---|---|
| DEX | Factory, router, adapter, router registration, Risk executor wiring | Verified token/factory/router/pool inputs and route policy; next local integration |
| Futures | Registry, Vault, Engine and role/configuration calls | Official Dual Oracle, market inputs and live authority |
| Lending/Earn/Staking | Six Lending contracts, index and liquidation links, separate staking vault/reward links | Oracle inputs, legacy reconciliation, market activation approval |
| Intent | Escrow, Binding and Competitive Hub | Approved live creator/solver/router inputs |
| Solver | Internal Solver, Registry, Bond/Reputation and Assignment configuration | Approved solvers, bonds and limits |
| Settlement | Receipt recorder, Hub and embedded Verifier bindings | Live settlement authority and finality evidence |
| Launchpad | Project Registry, Sale Factory and approved liquidity path | Token, funding and LP policy |
| Creator Network | Reward Vault and Safe Payout Gate configuration | Legacy liabilities, Vault sealing, approved payout authority |
| Risk Engine | Risk Registry, executor, caps and emergency linkage | Approved limits, historical and trace evidence |
| Governance | Safe calls and six-target Emergency Relay | Live Safe ownership, thresholds, guard, modules and permissions |

The stage 102 Anvil worker uses unlocked local accounts and fixture Safe signatures. Public broadcasting is out of scope. The Anvil harness resolves the expected deployed runtime with a creation simulation, then compares it with the compiled artifact and the recovered on-chain runtime. The full five-slot test covers one Safe configuration before Relay; post-deployment authority setup is checked in the same local scenario separately. This is the final recovery test stage. Move independent development to DEX/Router connections.
