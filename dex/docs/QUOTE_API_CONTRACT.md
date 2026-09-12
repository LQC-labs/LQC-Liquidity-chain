# LQC DEX Quote API Contract

Status: BSC testnet MVP

The browser UI and any future service adapter must treat quote data as read-only evidence until the execution path revalidates the trade.

## Response envelope

A valid response has:

- `version: 1`
- `type: LQC_QUOTE_RESPONSE`
- `chainId: 97`
- a non-negative integer `requestId`
- a non-negative integer `generatedAt`
- at least one normalized quote

Each quote includes:

- `dexId` and `dexName`
- distinct `tokenIn` and `tokenOut`
- positive integer strings `amountInRaw` and `amountOutRaw`
- bounded `slippageBps` from 1 to 1000
- positive `minimumOutputRaw` calculated as `amountOutRaw * (10000 - slippageBps) / 10000`
- non-negative `quotedAt` and `blockNumber`

## Example

```json
{
  "version": 1,
  "type": "LQC_QUOTE_RESPONSE",
  "chainId": 97,
  "requestId": 7,
  "generatedAt": 1757635200000,
  "quotes": [
    {
      "version": 1,
      "dexId": "0xreviewed-dex",
      "dexName": "LQC Flow",
      "tokenIn": "0x...01",
      "tokenOut": "0x...02",
      "amountInRaw": "1000000000000000000",
      "amountOutRaw": "250000000000000000",
      "minimumOutputRaw": "247500000000000000",
      "slippageBps": 100,
      "quotedAt": 1757635200000,
      "blockNumber": 12345678
    }
  ]
}
```

## Safety boundary

The adapter never signs, approves, estimates, or submits a transaction. The execution path must independently revalidate chain, token pair, amount, quote age, block drift, minimum output, route allowlist, and gas policy.

Mainnet, production funds, and private keys remain out of scope until independent audit findings are resolved.
