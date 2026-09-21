# Master 3/6 — Best Execution Economic Integrity Gate

Status: verification gate
Base: 3c229bb7b1b56ba77c6f4990cfc26f68589bef02

## Goal

Verify that Best Execution selects economically superior executable routes rather than merely the largest gross quote.

## Required semantics

- netAmountOut = grossAmountOut - gasCostInTokenOut - protocolFeeInTokenOut;
- routes whose total execution cost consumes gross output fail closed;
- Best Execution compares net output across valid candidates;
- deterministic tie-breaking uses reviewed priority then stable candidate order;
- minimumAmountOut remains bound to user slippage policy;
- split routing must account for route costs without double counting;
- disabled/failed/drifted adapters cannot win selection;
- quote metadata and route hash remain bound to the execution candidate.

## Cross-module boundary

Futures or Lending may consume a reviewed quote/execution interface later, but their PnL, funding, interest, collateral, liquidation and accounting state must never alter Router Best Execution arithmetic.

## Exit

3/6 exits with focused EVM regression proving gas/fee-aware selection, tie handling, uneconomic-route rejection, split-cost accounting and tamper rejection.

`activationAuthorized: false`
