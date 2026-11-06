# Oracle Reference policy — approved isolated-package wording

Task M07-7-04-E-06-I-28 approved the I27 minimal proposal on2026-11-07. This package document implements that approval. The canonical GitHub MASTER/7/7 documents at main8db16368b3e09a94bfd500a17e33e3e9ef62ed51 were not edited or uploaded. The old remote7/7 mandatory TWAP wording is not this package's current approved requirement.

## Approved baseline

- Chainlink remains the MASTER Primary baseline; actual live deployment/price qualification is NOT_RUN.
- Pyth is an optional independent Reference candidate, not a mandatory provider/SDK. Licensing, actual signed payload/provider qualification and separate activation approval remain required.
- DEX TWAP is monitoring/anomaly evidence until separately qualified and approved for canonical Reference use. Different addresses/adapters alone do not prove source independence.
- Preserve exactly500bps, mandatory Primary/Reference freshness and stale/invalid/deviation/error fail-closed behavior. Provider or threshold changes require separate review, revalidation and approval.
- Preserve authenticated protection/bindings, liquidation readiness, verified debt checks and at most900-second, one-use Governance recovery. Guardian may only tighten restrictions.

## Approved minimum qualification wording

> An independent Reference qualified under the MASTER observation and Governance approval gate; DEX TWAP remains monitoring/anomaly evidence unless separately qualified for canonical use. Pyth is optional and subject to applicable licensing and provider verification.

Other7/7 evidence gates and MASTER requirements are retained. No actual price observation, signature check or provider independence evidence is fabricated by this documentation approval. Canonical remote document application is unperformed because GitHub changes remain forbidden; policy-content approval is recorded separately from remote execution.

D05/D06, Pyth SDK copy/install/use, real token/Proxy/provider qualification, testnet transfer, operational liquidation and conditional ADL activation remain BLOCKED.
