# LQC Flow — CEX Integration Readiness Specification

Status: Draft / DEMO-to-Testnet roadmap
Scope: LQC Flow Futures and exchange-integration surfaces

## Objective

Keep LQC Flow Futures isolated from the existing AMM/Router2 implementation while evolving the project toward interfaces that are easier for global centralized exchanges, market makers, custodians, and integration teams to evaluate.

This document is a technical-readiness specification. It does not imply or guarantee listing by any exchange.

## Integration principles

1. Stable market identifiers: `LQCUSDT` internally and `LQC/USDT` for display.
2. Explicit asset metadata: symbol, decimals, network, deposit/withdrawal status, confirmations, minimums and fees must be machine-readable before production integration.
3. Deterministic market rules: tick size, quantity step, minimum quantity/notional, leverage limits and maintenance-margin parameters must be versioned.
4. Provider isolation: external market data, custody, wallet, oracle and execution providers must sit behind adapters rather than being imported directly by UI code.
5. Environment isolation: DEMO, TESTNET and PRODUCTION configurations must never share credentials or endpoints.
6. Observable operations: request IDs, timestamps, error codes and audit events must be available for integration debugging.
7. Backward compatibility: public API changes require explicit API versions and migration notes.

## Target public REST surface

All examples are target contracts, not production endpoints yet.

### Public market data

- `GET /api/v1/time`
- `GET /api/v1/exchangeInfo`
- `GET /api/v1/ticker/24hr?symbol=LQCUSDT`
- `GET /api/v1/ticker/book?symbol=LQCUSDT`
- `GET /api/v1/depth?symbol=LQCUSDT&limit=100`
- `GET /api/v1/trades?symbol=LQCUSDT&limit=100`
- `GET /api/v1/klines?symbol=LQCUSDT&interval=1m&limit=500`
- `GET /api/v1/fundingRate?symbol=LQCUSDT`
- `GET /api/v1/markPrice?symbol=LQCUSDT`

### Authenticated trading target

- `POST /api/v1/order`
- `DELETE /api/v1/order`
- `GET /api/v1/order`
- `GET /api/v1/openOrders`
- `GET /api/v1/account`
- `GET /api/v1/positions`
- `GET /api/v1/userTrades`

Production authentication design must include timestamp/recv-window validation, nonce/replay protection, API-key permissions and request signing. Secrets must never be committed to this repository.

## Target WebSocket streams

- `ticker.<symbol>`
- `bookTicker.<symbol>`
- `depth.<symbol>`
- `trade.<symbol>`
- `kline.<interval>.<symbol>`
- `markPrice.<symbol>`
- authenticated `orders`
- authenticated `positions`
- authenticated `account`

Each event should contain a schema version, event timestamp and monotonic sequence/update identifier where ordering matters. Depth consumers must be able to detect sequence gaps and rebuild from a REST snapshot.

## Exchange information contract

`exchangeInfo` should expose at minimum:

- API/schema version
- server time
- environment
- market status
- base and quote assets
- price tick size
- quantity step size
- minimum/maximum quantity
- minimum notional
- supported order types
- maximum leverage
- maintenance-margin parameters
- funding interval for perpetual markets

## Asset / wallet integration target

Before a production CEX integration package is considered complete, LQC should provide verified network metadata separately from the futures UI:

- canonical chain/network name and chain ID
- native/token asset identifier and decimals
- official RPC endpoints or integration guidance
- block explorer
- deposit address format
- memo/tag requirements if applicable
- required confirmations/finality guidance
- deposit/withdrawal minimums
- withdrawal fee policy
- wallet maintenance/status signaling
- testnet faucet/integration procedure when available

No private keys, seed phrases, exchange credentials or custody secrets belong in this repository.

## Error model

Public and authenticated APIs should converge on a predictable envelope such as:

```json
{
  "code": "INVALID_QUANTITY",
  "message": "Quantity does not satisfy the market step size.",
  "requestId": "...",
  "timestamp": 0
}
```

Error codes must remain stable enough for exchange and market-maker integrations to automate recovery.

## Security and operational readiness

Production readiness requires, outside the current browser demo:

- server-side order validation
- authenticated authorization boundaries
- rate limiting and abuse controls
- idempotency for order submission where appropriate
- replay protection
- secure secret management
- immutable/auditable trading events
- dependency and supply-chain scanning
- wallet/custody security review
- incident and maintenance procedures
- independent security review before handling real assets

The browser DEMO must never be represented as custody, settlement or production liquidation infrastructure.

## Market-maker readiness

A market-maker integration should be able to obtain:

- deterministic instrument metadata
- low-latency ticker/trade/depth streams
- order acknowledgements with stable IDs
- cancel/replace semantics
- open-order and position reconciliation
- server timestamps
- sequence IDs
- rate-limit metadata
- sandbox/testnet credentials and endpoints

## Implementation phases

### Phase A — current DEMO

- isolated Futures UI
- multi-market registry
- order/position/risk engines
- market-data adapter
- isolated/cross demo margin accounting

### Phase B — integration contract

- versioned exchange-info schema
- normalized ticker/depth/trade/kline models
- transport-independent service interfaces
- stable error catalog
- deterministic tests

### Phase C — testnet gateway

- server-side REST gateway
- WebSocket gateway
- authenticated sandbox accounts
- order lifecycle/reconciliation
- persistent audit/event store
- monitoring and rate limits

### Phase D — production readiness

- production custody/wallet architecture
- independent security review
- operational runbooks
- disaster recovery
- load/failure testing
- compliance/legal review for target jurisdictions and products

## Definition of CEX technical package readiness

The repository should eventually be able to generate or reference a package containing:

1. Chain and asset technical sheet.
2. Testnet/RPC/explorer documentation.
3. Deposit/withdrawal integration guide.
4. REST/WebSocket API specification.
5. Market and precision parameters.
6. Security architecture summary without secrets.
7. Test vectors and integration test results.
8. Release/version history and supported environments.
9. Technical contact/escalation procedure maintained by the project team.

This specification should be updated as LQC network and production requirements are finalized.