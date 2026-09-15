// LQC Flow Futures — demo risk calculations only.
// No custody, settlement, oracle, or live liquidation execution is performed here.

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

export function calculateNotional({ quantity, markPrice }) {
  return Number(quantity) * Number(markPrice);
}

export function calculateInitialMargin({ quantity, markPrice, leverage }) {
  const lev = Number(leverage);
  if (!Number.isFinite(lev) || lev < 1) throw new Error("INVALID_LEVERAGE");
  return calculateNotional({ quantity, markPrice }) / lev;
}

export function calculateUnrealizedPnl({ side, quantity, entryPrice, markPrice }) {
  const direction = String(side).toUpperCase() === "SHORT" ? -1 : 1;
  return direction * Number(quantity) * (Number(markPrice) - Number(entryPrice));
}

export function calculateMaintenanceMargin({ quantity, markPrice, maintenanceMarginRate }) {
  return calculateNotional({ quantity, markPrice }) * Number(maintenanceMarginRate);
}

export function calculateLiquidationPrice({ side, quantity, entryPrice, collateral, maintenanceMarginRate }) {
  const qty = positiveNumber(quantity, "INVALID_QUANTITY");
  const entry = positiveNumber(entryPrice, "INVALID_ENTRY_PRICE");
  const margin = positiveNumber(collateral, "INVALID_COLLATERAL");
  const mmr = Number(maintenanceMarginRate);
  if (!Number.isFinite(mmr) || mmr < 0 || mmr >= 1) throw new Error("INVALID_MAINTENANCE_MARGIN_RATE");

  const normalizedSide = String(side).toUpperCase();
  if (normalizedSide === "LONG") {
    return Math.max(0, (qty * entry - margin) / (qty * (1 - mmr)));
  }
  if (normalizedSide === "SHORT") {
    return (margin + qty * entry) / (qty * (1 + mmr));
  }
  throw new Error("INVALID_SIDE");
}

export function positionHealth({ side, quantity, entryPrice, markPrice, collateral, maintenanceMarginRate }) {
  const unrealizedPnl = calculateUnrealizedPnl({ side, quantity, entryPrice, markPrice });
  const equity = Number(collateral) + unrealizedPnl;
  const maintenanceMargin = calculateMaintenanceMargin({ quantity, markPrice, maintenanceMarginRate });
  return {
    unrealizedPnl,
    equity,
    maintenanceMargin,
    liquidationPrice: calculateLiquidationPrice({ side, quantity, entryPrice, collateral, maintenanceMarginRate }),
    liquidatable: equity <= maintenanceMargin
  };
}
