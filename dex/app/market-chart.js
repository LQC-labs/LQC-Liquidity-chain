(function () {
  "use strict";

  const canvas = document.getElementById("marketChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const periodSeeds = { "1m": 11, "15m": 29, "1h": 47, "4h": 71, "1d": 97 };
  let activePeriod = "15m";

  function random(seed) {
    let value = seed >>> 0;
    return function () {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function createCandles(period, count) {
    const next = random(periodSeeds[period] || 29);
    const candles = [];
    let close = 0.0914;
    for (let index = 0; index < count; index += 1) {
      const open = close;
      const wave = Math.sin(index / 4.5) * 0.00022;
      close = Math.max(0.088, open + (next() - 0.5) * 0.00115 + wave);
      const high = Math.max(open, close) + next() * 0.00042;
      const low = Math.min(open, close) - next() * 0.00042;
      candles.push({ open, high, low, close, volume: 20 + next() * 90 + Math.abs(close - open) * 120000 });
    }
    return candles;
  }

  function average(candles, end, length) {
    const start = Math.max(0, end - length + 1);
    const values = candles.slice(start, end + 1);
    return values.reduce((sum, candle) => sum + candle.close, 0) / values.length;
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
    const count = width < 520 ? 42 : 64;
    const candles = createCandles(activePeriod, count);
    const pad = { top: 18, right: 58, bottom: 22, left: 8 };
    const volumeHeight = Math.max(62, height * 0.2);
    const priceBottom = height - volumeHeight - 24;
    const plotWidth = width - pad.left - pad.right;
    const highs = candles.map((candle) => candle.high);
    const lows = candles.map((candle) => candle.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const range = maxPrice - minPrice || 1;
    const maxVolume = Math.max(...candles.map((candle) => candle.volume));
    const step = plotWidth / candles.length;
    const candleWidth = Math.max(3, Math.min(9, step * 0.62));
    const priceY = (price) => pad.top + ((maxPrice - price) / range) * (priceBottom - pad.top);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#edf0f2";
    ctx.lineWidth = 1;
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#90969d";
    ctx.textAlign = "left";
    for (let line = 0; line <= 4; line += 1) {
      const y = pad.top + ((priceBottom - pad.top) * line) / 4;
      const value = maxPrice - (range * line) / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      ctx.fillText(value.toFixed(5), width - pad.right + 7, y + 4);
    }
    for (let line = 1; line < 5; line += 1) {
      const x = pad.left + (plotWidth * line) / 5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    candles.forEach((candle, index) => {
      const x = pad.left + step * index + step / 2;
      const up = candle.close >= candle.open;
      const color = up ? "#62af05" : "#ee3ea4";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, priceY(candle.high)); ctx.lineTo(x, priceY(candle.low)); ctx.stroke();
      const top = priceY(Math.max(candle.open, candle.close));
      const bodyHeight = Math.max(2, Math.abs(priceY(candle.open) - priceY(candle.close)));
      ctx.fillRect(x - candleWidth / 2, top, candleWidth, bodyHeight);
      const volumeTop = height - pad.bottom - (candle.volume / maxVolume) * (volumeHeight - 20);
      ctx.globalAlpha = 0.48;
      ctx.fillRect(x - candleWidth / 2, volumeTop, candleWidth, height - pad.bottom - volumeTop);
      ctx.globalAlpha = 1;
    });

    [[5, "#e1ad35"], [10, "#c54779"], [20, "#28b7c2"]].forEach(([length, color]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      candles.forEach((_, index) => {
        const x = pad.left + step * index + step / 2;
        const y = priceY(average(candles, index, length));
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    const last = candles.length - 1;
    document.getElementById("ma5Value").textContent = average(candles, last, 5).toFixed(5);
    document.getElementById("ma10Value").textContent = average(candles, last, 10).toFixed(5);
    document.getElementById("ma20Value").textContent = average(candles, last, 20).toFixed(5);
  }

  function activateWithin(selector, button) {
    document.querySelectorAll(`${selector} button`).forEach((item) => item.classList.toggle("active", item === button));
  }

  document.querySelectorAll(".timeframes button").forEach((button) => button.addEventListener("click", () => {
    activePeriod = button.dataset.period;
    activateWithin(".timeframes", button);
    draw();
  }));
  [".market-tabs", ".indicator-tabs", ".position-tabs"].forEach((selector) => {
    document.querySelectorAll(`${selector} button`).forEach((button) => button.addEventListener("click", () => activateWithin(selector, button)));
  });

  const redraw = typeof ResizeObserver === "function" ? new ResizeObserver(draw) : null;
  if (redraw) redraw.observe(canvas);
  else window.addEventListener("resize", draw);
  draw();
})();
