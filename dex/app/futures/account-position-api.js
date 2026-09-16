// LQC Flow Futures — authenticated account/position query contract.
// Adapts the existing DEMO margin account and position book to API-safe views.

import { markDemoPosition } from './position-engine.js';
import { API_PERMISSIONS, verifySignedRequest } from './api-auth-contract.js';

function frozenList(items) {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

export function createAccountPositionApi({ account, positionBook, marketData, verifySignature, replayGuard, resolveApiKey }) {
  if (!account || typeof account.snapshot !== 'function' || typeof account.health !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!positionBook || typeof positionBook.list !== 'function') throw new Error('POSITION_BOOK_REQUIRED');
  if (!marketData || typeof marketData.getMarkPrice !== 'function') throw new Error('MARKET_DATA_PROVIDER_REQUIRED');
  if (typeof resolveApiKey !== 'function') throw new Error('API_KEY_RESOLVER_REQUIRED');
  if (typeof verifySignature !== 'function') throw new Error('SIGNATURE_VERIFIER_REQUIRED');

  async function authenticate(auth) {
    const descriptor = await resolveApiKey(String(auth?.keyId || ''));
    return verifySignedRequest({
      descriptor,
      requiredPermission: API_PERMISSIONS.READ,
      request: auth?.request,
      signature: auth?.signature,
      verifySignature,
      replayGuard,
      serverTime: Date.now()
    });
  }

  function markPriceOf(symbol) {
    const price = Number(marketData.getMarkPrice(symbol));
    if (!Number.isFinite(price) || price <= 0) throw new Error('MARK_PRICE_UNAVAILABLE');
    return price;
  }

  function publicPosition(position) {
    const marked = markDemoPosition(position, markPriceOf(position.symbol));
    return Object.freeze({
      symbol: marked.symbol,
      side: marked.side,
      marginMode: position.marginMode || 'ISOLATED',
      quantity: marked.quantity,
      entryPrice: marked.entryPrice,
      markPrice: marked.markPrice,
      leverage: marked.leverage,
      collateral: marked.collateral,
      unrealizedPnl: marked.unrealizedPnl,
      equity: marked.equity,
      maintenanceMargin: marked.maintenanceMargin,
      liquidationPrice: marked.liquidationPrice,
      liquidatable: marked.liquidatable,
      takeProfit: position.takeProfit ?? null,
      stopLoss: position.stopLoss ?? null,
      openedAt: position.openedAt,
      updatedAt: position.updatedAt ?? null
    });
  }

  async function positions({ auth, symbol = null } = {}) {
    const principal = await authenticate(auth);
    const normalized = symbol ? String(symbol).toUpperCase() : null;
    const values = positionBook.list()
      .filter((position) => !normalized || position.symbol === normalized)
      .map(publicPosition);
    return Object.freeze({ accountKeyId: principal.keyId, positions: frozenList(values) });
  }

  async function accountInfo({ auth } = {}) {
    const principal = await authenticate(auth);
    const rawPositions = positionBook.list();
    const snapshot = account.snapshot();
    const cross = account.health(rawPositions, markPriceOf);
    const marked = rawPositions.map(publicPosition);
    const isolatedUnrealizedPnl = marked
      .filter((position) => position.marginMode !== 'CROSS')
      .reduce((sum, position) => sum + position.unrealizedPnl, 0);
    const totalUnrealizedPnl = marked.reduce((sum, position) => sum + position.unrealizedPnl, 0);

    return Object.freeze({
      accountKeyId: principal.keyId,
      asset: 'USDT',
      availableBalance: snapshot.availableBalance,
      isolatedReserved: snapshot.isolatedReserved,
      crossReserved: snapshot.crossReserved,
      totalReserved: snapshot.totalReserved,
      crossWalletBalance: snapshot.crossWalletBalance,
      isolatedUnrealizedPnl,
      crossUnrealizedPnl: cross.unrealizedPnl,
      totalUnrealizedPnl,
      crossEquity: cross.equity,
      crossMaintenanceMargin: cross.maintenanceMargin,
      crossMarginRatio: Number.isFinite(cross.marginRatio) ? cross.marginRatio : null,
      crossLiquidatable: cross.liquidatable,
      positionCount: marked.length,
      environment: 'DEMO'
    });
  }

  return Object.freeze({ accountInfo, positions });
}

// Target authenticated REST mapping:
// GET /api/v1/account   -> accountInfo()
// GET /api/v1/positions -> positions()
//
// This layer is read-only. Production mutations must flow through the trusted
// trading/risk service and persistent account ledger, never directly through
// browser-owned account or position objects.
