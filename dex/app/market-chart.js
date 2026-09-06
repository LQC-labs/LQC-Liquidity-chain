(function () {
  "use strict";

  const canvas = document.getElementById("marketChart");
  if (!canvas || !window.LQCMarketData) return;
  const ctx = canvas.getContext("2d");
  const ui = {
    price: document.getElementById("marketPrice"), change: document.getElementById("marketChange"),
    source: document.getElementById("marketSource"), freshness: document.getElementById("marketFreshness"),
    ma5: document.getElementById("ma5Value"), ma10: document.getElementById("ma10Value"), ma20: document.getElementById("ma20Value")
  };
  const periodSeeds = { "1m": 11, "15m": 29, "1h": 47, "4h": 71, "1d": 97 };
  const marketConfig = window.LQC_FLOW_CONFIG.marketData || {};
  let activePeriod = "15m";
  let candles = [];
  let refreshTimer;

  function random(seed) {
    let value = seed >>> 0;
    return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function createDemoCandles(period, count = 100) {
    const next = random(periodSeeds[period] || 29);
    const result = [];
    let close = 0.0914;
    for (let index = 0; index < count; index += 1) {
      const open = close;
      close = Math.max(0.088, open + (next() - 0.5) * 0.00115 + Math.sin(index / 4.5) * 0.00022);
      result.push({ timestamp: index, open, high: Math.max(open, close) + next() * 0.00042,
        low: Math.min(open, close) - next() * 0.00042, close,
        volume: 20 + next() * 90 + Math.abs(close - open) * 120000 });
    }
    return result;
  }

  function average(items, end, length) {
    const values = items.slice(Math.max(0, end - length + 1), end + 1);
    return values.reduce((sum, item) => sum + item.close, 0) / values.length;
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) return "—";
    return value >= 1 ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value.toPrecision(5);
  }

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return rect;
  }

  function draw() {
    const { width, height } = fitCanvas();
    const visible = candles.slice(-(width < 520 ? 42 : 64));
    if (!visible.length) return;
    const pad = { top: 18, right: 62, bottom: 22, left: 8 };
    const volumeHeight = Math.max(62, height * 0.2);
    const priceBottom = height - volumeHeight - 24;
    const plotWidth = width - pad.left - pad.right;
    const maxPrice = Math.max(...visible.map((item) => item.high));
    const minPrice = Math.min(...visible.map((item) => item.low));
    const range = maxPrice - minPrice || 1;
    const maxVolume = Math.max(...visible.map((item) => item.volume), 1);
    const step = plotWidth / visible.length;
    const candleWidth = Math.max(3, Math.min(9, step * 0.62));
    const priceY = (price) => pad.top + ((maxPrice - price) / range) * (priceBottom - pad.top);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#edf0f2"; ctx.lineWidth = 1;
    ctx.font = "11px Inter, system-ui, sans-serif"; ctx.fillStyle = "#90969d"; ctx.textAlign = "left";
    for (let line = 0; line <= 4; line += 1) {
      const y = pad.top + ((priceBottom - pad.top) * line) / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      ctx.fillText(formatPrice(maxPrice - (range * line) / 4), width - pad.right + 7, y + 4);
    }
    for (let line = 1; line < 5; line += 1) {
      const x = pad.left + (plotWidth * line) / 5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    visible.forEach((item, index) => {
      const x = pad.left + step * index + step / 2;
      const color = item.close >= item.open ? "#62af05" : "#ee3ea4";
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, priceY(item.high)); ctx.lineTo(x, priceY(item.low)); ctx.stroke();
      const top = priceY(Math.max(item.open, item.close));
      ctx.fillRect(x - candleWidth / 2, top, candleWidth, Math.max(2, Math.abs(priceY(item.open) - priceY(item.close))));
      const volumeTop = height - pad.bottom - (item.volume / maxVolume) * (volumeHeight - 20);
      ctx.globalAlpha = 0.48; ctx.fillRect(x - candleWidth / 2, volumeTop, candleWidth, height - pad.bottom - volumeTop); ctx.globalAlpha = 1;
    });
    [[5, "#e1ad35"], [10, "#c54779"], [20, "#28b7c2"]].forEach(([length, color]) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.25; ctx.beginPath();
      visible.forEach((_, index) => {
        const x = pad.left + step * index + step / 2;
        const y = priceY(average(visible, index, length));
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    const last = visible.length - 1;
    ui.ma5.textContent = formatPrice(average(visible, last, 5));
    ui.ma10.textContent = formatPrice(average(visible, last, 10));
    ui.ma20.textContent = formatPrice(average(visible, last, 20));
  }

  function showDemo(reason = "풀 주소 미설정") {
    candles = createDemoCandles(activePeriod);
    const summary = window.LQCMarketData.marketSummary(candles, activePeriod, candles[candles.length - 1].timestamp);
    ui.price.textContent = `${formatPrice(summary.price)} DEMO`;
    ui.change.textContent = "실거래 시세 아님";
    ui.change.className = "market-change neutral";
    ui.source.textContent = "TESTNET DEMO";
    ui.source.className = "demo-label";
    ui.freshness.textContent = reason;
    draw();
  }

  async function loadMarket() {
    clearTimeout(refreshTimer);
    if (!window.LQCMarketData.isAddress(marketConfig.poolAddress)) return showDemo();
    ui.source.textContent = "데이터 불러오는 중";
    try {
      const result = await window.LQCMarketData.fetchOhlcv(marketConfig, activePeriod, { limit: 100 });
      candles = result.candles;
      const { price, changePercent, updatedAt, stale } = result.summary;
      ui.price.textContent = `${formatPrice(price)} WBNB`;
      ui.change.textContent = `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
      ui.change.className = `market-change ${changePercent >= 0 ? "positive" : "negative"}`;
      ui.source.textContent = stale ? `${result.source} · STALE` : `${result.source} · LIVE`;
      ui.source.className = stale ? "demo-label stale" : "demo-label live";
      ui.freshness.textContent = `업데이트 ${new Date(updatedAt * 1000).toLocaleString()}`;
      draw();
    } catch (error) {
      showDemo(error.name === "AbortError" ? "시세 응답 시간 초과" : "실데이터 연결 실패");
    }
    refreshTimer = setTimeout(loadMarket, 60000);
  }

  function activateWithin(selector, button) {
    document.querySelectorAll(`${selector} button`).forEach((item) => item.classList.toggle("active", item === button));
  }
  document.querySelectorAll(".timeframes button").forEach((button) => button.addEventListener("click", () => {
    activePeriod = button.dataset.period; activateWithin(".timeframes", button); loadMarket();
  }));
  [".market-tabs", ".indicator-tabs", ".position-tabs"].forEach((selector) => {
    document.querySelectorAll(`${selector} button`).forEach((button) => button.addEventListener("click", () => activateWithin(selector, button)));
  });
  const redraw = typeof ResizeObserver === "function" ? new ResizeObserver(draw) : null;
  if (redraw) redraw.observe(canvas); else window.addEventListener("resize", draw);
  loadMarket();
})();
