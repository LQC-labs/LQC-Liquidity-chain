;(function (global) {
  'use strict';

  function asPositiveBigInt(value, field) {
    try {
      const result = typeof value === 'bigint' ? value : BigInt(value);
      if (result <= 0n) throw new Error(field + ' must be positive');
      return result;
    } catch {
      throw new Error(field + ' must be a positive integer');
    }
  }

  function normalizeQuote(input, policy = {}) {
    if (!input || typeof input !== 'object') throw new Error('Quote must be an object');
    const amountInRaw = asPositiveBigInt(input.amountInRaw, 'amountInRaw');
    const amountOutRaw = asPositiveBigInt(input.amountOutRaw, 'amountOutRaw');
    const slippageBps = Number(policy.slippageBps ?? input.slippageBps ?? 100);
    if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1000) {
      throw new Error('slippageBps must be an integer from 1 to 1000');
    }
    const minimumOutputRaw = amountOutRaw * BigInt(10000 - slippageBps) / 10000n;
    if (minimumOutputRaw <= 0n) throw new Error('minimumOutputRaw must be positive');
    const dexId = String(input.dexId || '').toLowerCase();
    const dexName = String(input.dexName || input.name || '').trim();
    if (!dexId || !dexName || !input.tokenIn || !input.tokenOut) {
      throw new Error('Quote identity is incomplete');
    }
    const tokenIn = String(input.tokenIn).toLowerCase();
    const tokenOut = String(input.tokenOut).toLowerCase();
    if (tokenIn === tokenOut) throw new Error('Quote tokens must be different');
    const quotedAt = Number(input.quotedAt ?? Date.now());
    const blockNumber = Number(input.blockNumber ?? 0);
    if (!Number.isSafeInteger(quotedAt) || quotedAt < 0) throw new Error('quotedAt is invalid');
    if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) throw new Error('blockNumber is invalid');
    return {
      version: 1,
      dexId,
      dexName,
      tokenIn,
      tokenOut,
      amountInRaw: amountInRaw.toString(),
      amountOutRaw: amountOutRaw.toString(),
      minimumOutputRaw: minimumOutputRaw.toString(),
      slippageBps,
      quotedAt,
      blockNumber
    };
  }

  function buildQuoteResponse({ chainId, requestId, quotes, generatedAt = Date.now() }) {
    if (!Number.isInteger(Number(chainId)) || Number(chainId) !== 97) {
      throw new Error('Only BSC testnet chain 97 is supported');
    }
    if (!Number.isSafeInteger(requestId) || requestId < 0) throw new Error('requestId is invalid');
    if (!Array.isArray(quotes) || quotes.length === 0) throw new Error('At least one quote is required');
    const normalized = quotes.map(quote => normalizeQuote(quote));
    normalized.sort((a, b) => BigInt(b.amountOutRaw) > BigInt(a.amountOutRaw) ? 1 : -1);
    return {
      version: 1,
      type: 'LQC_QUOTE_RESPONSE',
      chainId: 97,
      requestId,
      generatedAt: Number(generatedAt),
      quotes: normalized
    };
  }

  function isQuoteResponse(value) {
    return Boolean(value && value.version === 1 && value.type === 'LQC_QUOTE_RESPONSE' &&
      value.chainId === 97 && Number.isSafeInteger(value.requestId) &&
      Array.isArray(value.quotes) && value.quotes.length > 0);
  }

  const api = Object.freeze({ normalizeQuote, buildQuoteResponse, isQuoteResponse });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.LQCQuoteApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
