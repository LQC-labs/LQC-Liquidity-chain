import { listActiveFuturesMarkets, getFuturesMarket } from './markets.js';
import { buildDemoOrder } from './order-engine.js';
import { openDemoPosition, markDemoPosition } from './position-engine.js';

const prices = { LQCUSDT: 0.1854, BTCUSDT: 115000, ETHUSDT: 4500, SOLUSDT: 235, XRPUSDT: 3.05, FILUSDT: 4.2 };
const STARTING_BALANCE = 100000;
let availableBalance = STARTING_BALANCE;
let symbol = 'LQCUSDT';
let orderType = 'MARKET';
const demoPositions = [];
const byId = (id) => document.getElementById(id);

function formatUsdt(value) { return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`; }
function renderBalance() { byId('balance').textContent = formatUsdt(availableBalance); }
function optionalPrice(value) { if (value === '' || value == null) return null; const price = Number(value); if (!Number.isFinite(price) || price <= 0) throw new Error('INVALID_TP_SL_PRICE'); return price; }

function renderMarkets(filter = '') {
  const root = byId('markets'); root.replaceChildren();
  for (const market of listActiveFuturesMarkets()) {
    if (!market.symbol.includes(filter.toUpperCase())) continue;
    const row = document.createElement('button'); row.type = 'button'; row.className = 'market' + (market.symbol === symbol ? ' selected' : ''); row.textContent = `${market.base}/USDT  ${prices[market.symbol] ?? '-'}`;
    row.addEventListener('click', () => selectMarket(market.symbol)); root.appendChild(row);
  }
}

function selectMarket(nextSymbol) {
  symbol = nextSymbol; const market = getFuturesMarket(symbol); const price = prices[symbol] || 1;
  byId('symbol').textContent = `${market.base}/USDT`; byId('chart-title').textContent = `${market.base}/USDT Chart`; byId('mark').textContent = String(price); byId('price').value = String(price);
  byId('leverage').max = String(market.maxLeverage); if (Number(byId('leverage').value) > market.maxLeverage) byId('leverage').value = String(market.maxLeverage);
  renderMarkets(byId('search').value); refreshEstimate();
}

function orderInput(side) { return { symbol, side, type: orderType, quantity: Number(byId('qty').value), leverage: Number(byId('leverage').value), markPrice: prices[symbol], price: Number(byId('price').value), reduceOnly: byId('reduce').checked, takeProfit: byId('tp').value, stopLoss: byId('sl').value }; }
function refreshEstimate() { byId('levLabel').textContent = `${byId('leverage').value}x`; try { const order = buildDemoOrder(orderInput('LONG')); byId('margin').textContent = formatUsdt(order.initialMargin); } catch { byId('margin').textContent = '-'; } }
function appendField(root, label, value) { const item = document.createElement('span'); const title = document.createElement('small'); const data = document.createElement('b'); title.textContent = label; data.textContent = value; item.append(title, data); root.appendChild(item); }

function shouldTrigger(position, markPrice) {
  if (position.side === 'LONG') {
    if (position.takeProfit && markPrice >= position.takeProfit) return 'TP';
    if (position.stopLoss && markPrice <= position.stopLoss) return 'SL';
  } else {
    if (position.takeProfit && markPrice <= position.takeProfit) return 'TP';
    if (position.stopLoss && markPrice >= position.stopLoss) return 'SL';
  }
  return null;
}

function renderPositions() {
  const root = byId('positions'); root.replaceChildren();
  if (demoPositions.length === 0) { root.className = 'empty'; root.textContent = '아직 데모 포지션이 없습니다.'; return; }
  root.className = '';
  for (const position of demoPositions) {
    const marked = markDemoPosition(position, prices[position.symbol]); const pnlSign = marked.unrealizedPnl >= 0 ? '+' : ''; const card = document.createElement('div'); card.className = 'demo-position';
    appendField(card, '마켓', marked.symbol); appendField(card, '포지션', `${marked.side} · ${marked.leverage}x`); appendField(card, '수량', String(marked.quantity)); appendField(card, '진입가', String(marked.entryPrice)); appendField(card, 'Mark', String(marked.markPrice)); appendField(card, '미실현 PnL', `${pnlSign}${marked.unrealizedPnl.toFixed(4)} USDT`); appendField(card, '격리 증거금', formatUsdt(marked.collateral)); appendField(card, '예상 청산가', marked.liquidationPrice.toFixed(6)); appendField(card, 'TP / SL', `${position.takeProfit ?? '-'} / ${position.stopLoss ?? '-'}`);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '데모 청산'; close.addEventListener('click', () => closePosition(position.id, 'MANUAL')); card.appendChild(close); root.appendChild(card);
  }
}

function closePosition(id, reason = 'MANUAL') {
  const index = demoPositions.findIndex((position) => position.id === id); if (index < 0) return;
  const position = demoPositions[index]; const marked = markDemoPosition(position, prices[position.symbol]); availableBalance += Math.max(0, position.collateral + marked.unrealizedPnl); demoPositions.splice(index, 1); renderBalance(); renderPositions();
  const sign = marked.unrealizedPnl >= 0 ? '+' : ''; byId('message').textContent = `데모 포지션 종료(${reason}) · ${position.symbol} ${position.side} · PnL ${sign}${marked.unrealizedPnl.toFixed(4)} USDT`;
}

function reducePosition(side) {
  const quantity = Number(byId('qty').value); if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_QUANTITY');
  const opposite = side === 'LONG' ? 'SHORT' : 'LONG'; const index = demoPositions.findIndex((position) => position.symbol === symbol && position.side === opposite); if (index < 0) throw new Error('NO_POSITION_TO_REDUCE');
  const position = demoPositions[index]; if (quantity > position.quantity) throw new Error('REDUCE_EXCEEDS_POSITION');
  const marked = markDemoPosition(position, prices[position.symbol]); const ratio = quantity / position.quantity; const releasedMargin = position.collateral * ratio; const realizedPnl = marked.unrealizedPnl * ratio; availableBalance += Math.max(0, releasedMargin + realizedPnl);
  if (quantity === position.quantity) demoPositions.splice(index, 1); else demoPositions[index] = Object.freeze({ ...position, quantity: position.quantity - quantity, collateral: position.collateral - releasedMargin });
  renderBalance(); renderPositions(); const sign = realizedPnl >= 0 ? '+' : ''; byId('message').textContent = `Reduce Only · ${position.symbol} ${quantity} 감소 · 실현 PnL ${sign}${realizedPnl.toFixed(4)} USDT`;
}

function submit(side) {
  try {
    if (byId('reduce').checked) { reducePosition(side); return; }
    const order = buildDemoOrder(orderInput(side)); if (order.initialMargin > availableBalance) throw new Error('INSUFFICIENT_DEMO_BALANCE'); const entryPrice = order.type === 'LIMIT' ? order.price : order.markPrice;
    const takeProfit = optionalPrice(byId('tp').value); const stopLoss = optionalPrice(byId('sl').value);
    if (takeProfit && ((side === 'LONG' && takeProfit <= entryPrice) || (side === 'SHORT' && takeProfit >= entryPrice))) throw new Error('INVALID_TAKE_PROFIT');
    if (stopLoss && ((side === 'LONG' && stopLoss >= entryPrice) || (side === 'SHORT' && stopLoss <= entryPrice))) throw new Error('INVALID_STOP_LOSS');
    const base = openDemoPosition({ symbol: order.symbol, side: order.side, quantity: order.quantity, entryPrice, leverage: order.leverage, collateral: order.initialMargin }); const position = Object.freeze({ ...base, takeProfit, stopLoss });
    availableBalance -= position.collateral; demoPositions.push(position); renderBalance(); renderPositions(); byId('message').textContent = `데모 포지션 생성 · ${position.symbol} ${position.side} · 격리 증거금 ${formatUsdt(position.collateral)}`;
  } catch (error) { byId('message').textContent = `주문 확인: ${error.message}`; }
}

function evaluateTriggers() { for (const position of [...demoPositions]) { const reason = shouldTrigger(position, prices[position.symbol]); if (reason) closePosition(position.id, reason); } }
for (const button of document.querySelectorAll('.tabs button')) { button.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); orderType = button.dataset.type; byId('priceRow').hidden = orderType !== 'LIMIT'; refreshEstimate(); }); }
byId('search').addEventListener('input', (event) => renderMarkets(event.target.value)); for (const id of ['qty', 'price', 'leverage']) byId(id).addEventListener('input', refreshEstimate); byId('long').addEventListener('click', () => submit('LONG')); byId('short').addEventListener('click', () => submit('SHORT'));
renderMarkets(); refreshEstimate(); renderBalance(); renderPositions(); evaluateTriggers();
