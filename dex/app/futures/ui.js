import { listActiveFuturesMarkets, getFuturesMarket } from './markets.js';
import { buildDemoOrder } from './order-engine.js';

const prices = { LQCUSDT: 0.1854, BTCUSDT: 115000, ETHUSDT: 4500, SOLUSDT: 235, XRPUSDT: 3.05, FILUSDT: 4.2 };
let symbol = 'LQCUSDT';
let orderType = 'MARKET';
const byId = (id) => document.getElementById(id);

function renderMarkets(filter = '') {
  const root = byId('markets');
  root.replaceChildren();
  for (const market of listActiveFuturesMarkets()) {
    if (!market.symbol.includes(filter.toUpperCase())) continue;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'market' + (market.symbol === symbol ? ' selected' : '');
    row.textContent = `${market.base}/USDT  ${prices[market.symbol] ?? '-'}`;
    row.addEventListener('click', () => selectMarket(market.symbol));
    root.appendChild(row);
  }
}

function selectMarket(nextSymbol) {
  symbol = nextSymbol;
  const market = getFuturesMarket(symbol);
  const price = prices[symbol] || 1;
  byId('symbol').textContent = `${market.base}/USDT`;
  byId('chart-title').textContent = `${market.base}/USDT Chart`;
  byId('mark').textContent = String(price);
  byId('price').value = String(price);
  byId('leverage').max = String(market.maxLeverage);
  if (Number(byId('leverage').value) > market.maxLeverage) byId('leverage').value = String(market.maxLeverage);
  renderMarkets(byId('search').value);
  refreshEstimate();
}

function orderInput(side) {
  return {
    symbol,
    side,
    type: orderType,
    quantity: Number(byId('qty').value),
    leverage: Number(byId('leverage').value),
    markPrice: prices[symbol],
    price: Number(byId('price').value),
    reduceOnly: byId('reduce').checked,
    takeProfit: byId('tp').value,
    stopLoss: byId('sl').value
  };
}

function refreshEstimate() {
  byId('levLabel').textContent = `${byId('leverage').value}x`;
  try {
    const order = buildDemoOrder(orderInput('LONG'));
    byId('margin').textContent = `${order.initialMargin.toFixed(4)} USDT`;
  } catch {
    byId('margin').textContent = '-';
  }
}

function submit(side) {
  try {
    const order = buildDemoOrder(orderInput(side));
    byId('positions').className = '';
    byId('positions').textContent = `${order.symbol} · ${order.side} · ${order.leverage}x · Qty ${order.quantity} · Margin ${order.initialMargin.toFixed(4)} USDT`;
    byId('message').textContent = '데모 주문이 생성되었습니다. 실제 체결은 발생하지 않습니다.';
  } catch (error) {
    byId('message').textContent = `주문 확인: ${error.message}`;
  }
}

for (const button of document.querySelectorAll('.tabs button')) {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    orderType = button.dataset.type;
    byId('priceRow').hidden = orderType !== 'LIMIT';
    refreshEstimate();
  });
}
byId('search').addEventListener('input', (event) => renderMarkets(event.target.value));
for (const id of ['qty', 'price', 'leverage']) byId(id).addEventListener('input', refreshEstimate);
byId('long').addEventListener('click', () => submit('LONG'));
byId('short').addEventListener('click', () => submit('SHORT'));
renderMarkets();
refreshEstimate();
