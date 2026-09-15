import { listActiveFuturesMarkets, getFuturesMarket } from './markets.js';
import { buildDemoOrder } from './order-engine.js';
import { openDemoPosition, markDemoPosition } from './position-engine.js';

const prices = { LQCUSDT: 0.1854, BTCUSDT: 115000, ETHUSDT: 4500, SOLUSDT: 235, XRPUSDT: 3.05, FILUSDT: 4.2 };
let symbol = 'LQCUSDT';
let orderType = 'MARKET';
let demoPosition = null;
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

function renderPosition() {
  const root = byId('positions');
  if (!demoPosition) {
    root.className = 'empty';
    root.textContent = '아직 데모 포지션이 없습니다.';
    return;
  }
  const marked = markDemoPosition(demoPosition, prices[demoPosition.symbol]);
  const pnlSign = marked.unrealizedPnl >= 0 ? '+' : '';
  root.className = '';
  root.replaceChildren();
  const fields = [
    ['마켓', marked.symbol],
    ['포지션', `${marked.side} · ${marked.leverage}x`],
    ['수량', String(marked.quantity)],
    ['진입가', String(marked.entryPrice)],
    ['Mark', String(marked.markPrice)],
    ['미실현 PnL', `${pnlSign}${marked.unrealizedPnl.toFixed(4)} USDT`],
    ['유지증거금', `${marked.maintenanceMargin.toFixed(4)} USDT`],
    ['예상 청산가', marked.liquidationPrice.toFixed(6)]
  ];
  for (const [label, value] of fields) {
    const item = document.createElement('span');
    const title = document.createElement('small');
    const data = document.createElement('b');
    title.textContent = label;
    data.textContent = value;
    item.append(title, data);
    root.appendChild(item);
  }
}

function submit(side) {
  try {
    if (byId('reduce').checked) throw new Error('NO_DEMO_POSITION_TO_REDUCE');
    const order = buildDemoOrder(orderInput(side));
    const entryPrice = order.type === 'LIMIT' ? order.price : order.markPrice;
    demoPosition = openDemoPosition({
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      entryPrice,
      leverage: order.leverage,
      collateral: order.initialMargin
    });
    renderPosition();
    byId('message').textContent = '데모 포지션이 생성되었습니다. 실제 체결·자금 이동은 발생하지 않습니다.';
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
renderPosition();
