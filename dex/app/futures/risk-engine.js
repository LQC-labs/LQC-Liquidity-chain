// LQC Flow Futures — demo risk calculations only.
// No custody, settlement, oracle, or live liquidation execution is performed here.

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

export function positionHealth({ side, quantity, entryPrice, markPrice, collateral, maintenanceMarginRate }) {
  const unrealizedPnl = calculateUnrealizedPnl({ side, quantity, entryPrice, markPrice });
  const equity = Number(collateral) + unrealizedPnl;
  const maintenanceMargin = calculateMaintenanceMargin({ quantity, markPrice, maintenanceMarginRate });
  return {
    unrealizedPnl,
    equity,
    maintenanceMargin,
    liquidatable: equity <= maintenanceMargin
  };
}
