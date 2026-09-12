import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../app/quote-api.js');

describe('standard quote response adapter', function () {
  it('normalizes raw amounts and applies a bounded slippage policy', function () {
    const quote = api.normalizeQuote({
      dexId: '0xABC',
      dexName: 'LQC Flow',
      tokenIn: '0x0000000000000000000000000000000000000001',
      tokenOut: '0x0000000000000000000000000000000000000002',
      amountInRaw: 1000n,
      amountOutRaw: 2000n,
      blockNumber: 10
    }, { slippageBps: 75, now: 1 });
    assert.equal(quote.amountOutRaw, '2000');
    assert.equal(quote.minimumOutputRaw, '1985');
    assert.equal(quote.slippageBps, 75);
    assert.equal(quote.dexId, '0xabc');
  });

  it('builds a deterministic BSC testnet response and ranks quotes', function () {
    const response = api.buildQuoteResponse({
      chainId: 97,
      requestId: 4,
      generatedAt: 123,
      quotes: [
        { dexId: '0x1', name: 'Lower', tokenIn: 'A', tokenOut: 'B', amountInRaw: '100', amountOutRaw: '101' },
        { dexId: '0x2', name: 'Higher', tokenIn: 'A', tokenOut: 'B', amountInRaw: '100', amountOutRaw: '110' }
      ]
    });
    assert.equal(response.type, 'LQC_QUOTE_RESPONSE');
    assert.equal(response.quotes[0].dexName, 'Higher');
    assert.equal(response.quotes[0].minimumOutputRaw, '108');
    assert.equal(api.isQuoteResponse(response), true);
  });

  it('fails closed for wrong chain, unsafe slippage, and incomplete identity', function () {
    assert.throws(() => api.buildQuoteResponse({ chainId: 56, requestId: 1, quotes: [] }), /chain 97/);
    assert.throws(() => api.normalizeQuote({
      dexId: 'x', dexName: 'x', tokenIn: 'A', tokenOut: 'B',
      amountInRaw: '1', amountOutRaw: '1'
    }, { slippageBps: 1001 }), /slippageBps/);
    assert.throws(() => api.normalizeQuote({
      dexName: 'x', tokenIn: 'A', tokenOut: 'B',
      amountInRaw: '1', amountOutRaw: '1'
    }), /identity/);
  });
});
