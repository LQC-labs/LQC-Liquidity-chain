# LQC Technical Architecture

## 1. Purpose and Scope

The current LQC implementation separates route discovery from non-custodial execution. Off-chain components search candidate paths and allocations; on-chain contracts validate approved adapters, move user assets, execute swaps, and enforce the transaction-wide minimum output.

The current code is an unaudited MVP. Treasury, lending, oracle, bridge, governance, and production emergency-control modules described in the broader protocol design are not yet implemented in this repository.

## 2. Implemented Components

| Component | Responsibility | Trust boundary |
|---|---|---|
| `LQCFlowFactory` | Creates and registers LQC AMM pairs | Owner can initiate two-step ownership transfer |
| `LQCFlowPair` | Holds reserves, issues LP shares, enforces constant-product swaps | Non-reentrant pool operations |
| `LQCFlowRouter` | AMM liquidity and swap entry points | User-defined slippage and deadline |
| `LQCFlowQuoter` | Compares LQC AMM path candidates | View-only; no custody |
| `LQCFlowRouterV2` | Selects or executes routes through approved adapters | Owner-controlled adapter allowlist |
| `UniswapV2DEXAdapter` | Translates LQC route data to compatible DEX router calls | Callable for swaps only by Router 2.0 |
| SDK optimizer | Generates and ranks route/path candidates | Off-chain recommendation only |
| Browser optimizer | Compares configured routes and split allocations | Quote refreshed before user submission |
| Trading UI | Wallet connection, quote display, approval, and swap submission | User retains transaction approval |

## 3. Best-Route Flow

1. The SDK or browser generates direct and connector-token paths.
2. Each configured adapter is queried for output on each candidate path.
3. Failed, reverting, or zero-output routes are discarded.
4. Candidates are ranked by expected output; the SDK can subtract an output-token-denominated gas estimate.
5. The application applies the user's slippage tolerance to calculate `amountOutMin`.
6. Immediately before execution, the application refreshes the quote.
7. Router 2.0 validates the request and ignores adapters that are not enabled.
8. The selected adapter executes the swap, and Router 2.0 measures actual output by token-balance delta.
9. The transaction reverts unless actual aggregate output meets the user's global minimum.
10. Output is transferred directly to the specified recipient and any unused input is refunded.

## 4. Split-Route Flow

The on-chain split interface accepts up to eight routes. Allocations use basis points and must total exactly 10,000. The current SDK and browser optimize two-way splits; the browser tests 10% increments among leading candidates and selects a split only when expected improvement exceeds 0.10% over the best single route.

For each leg, Router 2.0:

- calculates the input amount from the approved allocation;
- verifies that the adapter is enabled;
- grants only the required temporary allowance;
- invokes the adapter;
- clears the allowance after execution; and
- measures final aggregate output rather than trusting the quoted return value.

The global `amountOutMin` is enforced after all legs complete. A failure in any leg reverts the entire transaction. Split execution currently supports ERC-20 input and output assets; native BNB uses the single-route wrapper flow.

## 5. Adapter Model

Every external integration implements `ILQCDEXAdapter`:

```solidity
quoteExactInput(tokenIn, tokenOut, amountIn, routeData)
swapExactInput(tokenIn, tokenOut, amountIn, amountOutMin, recipient, routeData)
```

The current `UniswapV2DEXAdapter` supports PancakeSwap V2, Biswap, and compatible routers. It validates path endpoints, limits path length to five addresses, rejects zero addresses and consecutive duplicate tokens, and restricts swap calls to the configured LQC aggregator.

An adapter being technically compatible does not mean it is deployed, approved, or endorsed. Every network-specific adapter and underlying DEX router must be independently verified before allowlisting.

## 6. Native BNB Handling

Router 2.0 wraps incoming BNB into the configured WBNB contract before adapter execution and unwraps WBNB for token-to-BNB output. Its `receive` function accepts native BNB only from WBNB, rejecting unsolicited transfers.

## 7. Planned Protocol Boundaries

Future architecture is expected to keep privileged and financial responsibilities separated:

- `AccessManager`: role separation and delayed privileged changes
- `EmergencyController`: function-level pause and incident controls
- `Treasury`: protocol fee and reserve accounting
- `OracleManager`: price freshness, deviation, and fallback rules
- `BridgeManager`: cross-chain message validation, limits, and supply accounting
- Lending modules: collateral, debt, health factor, repayment, and liquidation

These names describe planned boundaries, not deployed contracts. No single private key should ultimately control token supply, treasury, oracle, bridge, burn, and emergency privileges.

## 8. Repository Map

```text
dex/contracts/       Solidity implementation and interfaces
dex/contracts/adapters/ External DEX integration adapters
dex/sdk/             Off-chain route optimization
dex/app/             Static wallet-connected trading interface
dex/scripts/         Compile, verify, configure, and deploy tooling
dex/test/            AMM, optimizer, Router 2.0, and security-boundary tests
```
