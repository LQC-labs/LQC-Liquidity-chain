# Futures Parallel Inventory — Reuse / Revalidate / Gap / Defer

Status: parallel evidence audit while Master 3 Router work continues
Base: bc7dde21b0bc04dbb663aaa6d499df99a0e310ab

This inventory does not declare Master 7 complete and does not authorize production activation.

| Capability | Classification | Current evidence / reason |
|---|---|---|
| Futures Registry / multi-market foundation | REUSE | existing Futures foundation and BSC wiring evidence |
| Collateral Vault / isolated margin accounting | REUSE | existing implementation, guarded Testnet wiring and DEX isolation regression |
| Position Engine long/short | REUSE | existing implementation and guarded open/close flows |
| leverage / maintenance-margin checks | REVALIDATE | implemented/tested; economic parameter simulation remains later Master 7 work |
| liquidation path | REVALIDATE | implementation exists; full economic/adversarial E2E and bad-debt interaction remain |
| Mock Oracle | REUSE-TEST-ONLY | valid local/Testnet bootstrap evidence; never production price authority |
| AggregatorV3 production adapter | REUSE | current-main replacement work includes normalization, heartbeat, round/timestamp validation and circuit breaker |
| Primary BTC/USD feed candidate | REVALIDATE | official BSC Testnet candidate recorded; activation still blocked |
| independent reference source | GAP | production-grade independently reviewed reference not yet activated |
| V3 TWAP qualification/conversion | REUSE-AS-GATE | fail-closed qualification/conversion tooling exists; does not itself authorize a source |
| cross-source deviation gate | REUSE-AS-GATE | fail-closed safety gate exists |
| BSC Testnet Registry/Vault/Engine wiring | REVALIDATE | historical read-only verification/evidence exists; must be pinned to current canonical artifact/deployment lineage |
| first guarded position-open evidence | REVALIDATE | observed checkpoint exists; transaction evidence is incomplete in historical record |
| close-position guarded flow | REUSE | guarded read/close flow exists; full canonical E2E evidence still required |
| insurance / bad-debt handling | GAP | required before production readiness |
| funding-rate economic model | GAP | requires explicit model, bounds, manipulation analysis and E2E |
| Router shared execution/quote interface | DEFER-INTEGRATION | may integrate through reviewed interfaces only; Futures positions/margin remain isolated |
| Lending shared state | FORBIDDEN | Futures must not depend on Lending debt/collateral accounting |
| production activation | DEFER | requires Oracle completion, economic risk, full Testnet E2E, audit and governance |

## Parallel-work rule

Futures gaps may be developed before nominal Master 7 when they reduce system-wide rework or unblock shared interfaces, but they must keep independent accounting/failure domains and must not weaken Master-stage evidence requirements.

`activationAuthorized: false`
