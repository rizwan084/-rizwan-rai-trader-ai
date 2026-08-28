const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

const BINANCE = {
  spot: "https://api.binance.com",
  futures: "https://fapi.binance.com"
};

const cache = new Map();
const CACHE_MS = 15000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function marketBase(market) {
  return market === "spot" ? BINANCE.spot : BINANCE.futures;
}

async function binance(pathname, market, params = {}) {
  const url = new URL(marketBase(market) + pathname);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_MS) return hit.data;

  const response = await fetch(key, {
    headers: { "User-Agent": "Rizwan-Rai-Trader-AI/1.0" }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Binance ${response.status}: ${body.slice(0, 180)}`);
  }
  const data = await response.json();
  cache.set(key, { time: Date.now(), data });
  return data;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(d, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const tr = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr.push(candles[i].high - candles[i].low);
    else {
      const c = candles[i];
      const p = candles[i - 1].close;
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p)));
    }
  }
  return sma(tr, period);
}

function pivots(candles, left = 2, right = 2) {
  const highs = [], lows = [];
  for (let i = left; i < candles.length - right; i++) {
    let high = true, low = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) high = false;
      if (candles[j].low <= candles[i].low) low = false;
    }
    if (high) highs.push({ index: i, price: candles[i].high });
    if (low) lows.push({ index: i, price: candles[i].low });
  }
  return { highs, lows };
}

function roundPrice(v) {
  if (!Number.isFinite(v)) return 0;
  if (v >= 1000) return Number(v.toFixed(2));
  if (v >= 1) return Number(v.toFixed(4));
  if (v >= 0.01) return Number(v.toFixed(6));
  return Number(v.toFixed(8));
}

function analyzeCandles(raw, meta = {}) {
  const candles = raw.map(k => ({
    time: Math.floor(num(k[0]) / 1000),
    open: num(k[1]),
    high: num(k[2]),
    low: num(k[3]),
    close: num(k[4]),
    volume: num(k[5])
  }));

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const price = closes.at(-1);
  const e9 = ema(closes, 9);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const a = atr(candles, 14);
  const avgVol = sma(volumes, 20) || volumes.at(-1);
  const volRatio = avgVol ? volumes.at(-1) / avgVol : 1;
  const p = pivots(candles);
  const recentHigh = Math.max(...candles.slice(-30).map(c => c.high));
  const recentLow = Math.min(...candles.slice(-30).map(c => c.low));
  const prevHigh = Math.max(...candles.slice(-10, -2).map(c => c.high));
  const prevLow = Math.min(...candles.slice(-10, -2).map(c => c.low));
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const body = Math.abs(last.close - last.open);
  const range = Math.max(last.high - last.low, Number.EPSILON);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  let longScore = 0, shortScore = 0;
  const reasonsLong = [], reasonsShort = [];

  if (e9 && e20 && e9 > e20) { longScore += 12; reasonsLong.push("EMA 9 above EMA 20"); }
  if (e9 && e20 && e9 < e20) { shortScore += 12; reasonsShort.push("EMA 9 below EMA 20"); }
  if (e20 && e50 && e20 > e50) { longScore += 10; reasonsLong.push("EMA trend bullish"); }
  if (e20 && e50 && e20 < e50) { shortScore += 10; reasonsShort.push("EMA trend bearish"); }
  if (r !== null && r >= 52 && r <= 72) { longScore += 10; reasonsLong.push(`RSI ${r.toFixed(0)} supports momentum`); }
  if (r !== null && r <= 48 && r >= 28) { shortScore += 10; reasonsShort.push(`RSI ${r.toFixed(0)} supports downside`); }
  if (volRatio >= 1.25 && last.close > last.open) { longScore += 12; reasonsLong.push("Volume expansion on green candle"); }
  if (volRatio >= 1.25 && last.close < last.open) { shortScore += 12; reasonsShort.push("Volume expansion on red candle"); }

  const sweepLow = last.low < prevLow && last.close > prevLow;
  const sweepHigh = last.high > prevHigh && last.close < prevHigh;
  if (sweepLow) { longScore += 16; reasonsLong.push("Sell-side liquidity sweep"); }
  if (sweepHigh) { shortScore += 16; reasonsShort.push("Buy-side liquidity sweep"); }

  const bosUp = price > prevHigh;
  const bosDown = price < prevLow;
  if (bosUp) { longScore += 15; reasonsLong.push("Bullish break of structure"); }
  if (bosDown) { shortScore += 15; reasonsShort.push("Bearish break of structure"); }

  if (lowerWick / range > 0.45 && last.close > last.open) { longScore += 8; reasonsLong.push("Strong rejection from lows"); }
  if (upperWick / range > 0.45 && last.close < last.open) { shortScore += 8; reasonsShort.push("Strong rejection from highs"); }

  const last3 = candles.slice(-3);
  const fvgBull = last3.length === 3 && last3[2].low > last3[0].high;
  const fvgBear = last3.length === 3 && last3[2].high < last3[0].low;
  if (fvgBull) { longScore += 8; reasonsLong.push("Bullish imbalance / FVG"); }
  if (fvgBear) { shortScore += 8; reasonsShort.push("Bearish imbalance / FVG"); }

  const direction = longScore >= shortScore ? "LONG" : "SHORT";
  const rawConfidence = Math.max(longScore, shortScore);
  const confidence = Math.min(99, Math.max(50, Math.round(55 + rawConfidence * 0.42)));
  const risk = a || price * 0.01;

  let entry = price;
  let sl, tp1, tp2, tp3;
  if (direction === "LONG") {
    sl = Math.min(price - risk * 1.15, recentLow - risk * 0.15);
    const rr = Math.abs(price - sl);
    tp1 = price + rr * 1.2;
    tp2 = price + rr * 2.0;
    tp3 = price + rr * 3.0;
  } else {
    sl = Math.max(price + risk * 1.15, recentHigh + risk * 0.15);
    const rr = Math.abs(sl - price);
    tp1 = price - rr * 1.2;
    tp2 = price - rr * 2.0;
    tp3 = price - rr * 3.0;
  }

  const structure = bosUp ? "BULLISH BOS" : bosDown ? "BEARISH BOS" :
    (p.highs.length >= 2 && p.lows.length >= 2 ?
      (p.highs.at(-1).price > p.highs.at(-2).price && p.lows.at(-1).price > p.lows.at(-2).price ? "HIGHER HIGH / HIGHER LOW" :
       p.highs.at(-1).price < p.highs.at(-2).price && p.lows.at(-1).price < p.lows.at(-2).price ? "LOWER HIGH / LOWER LOW" : "RANGE") : "RANGE");

  const nearestSupport = Math.min(...[recentLow, ...p.lows.slice(-3).map(x => x.price)].filter(x => x < price));
  const nearestResistance = Math.min(...[recentHigh, ...p.highs.slice(-3).map(x => x.price)].filter(x => x > price));

  return {
    symbol: meta.symbol,
    market: meta.market,
    interval: meta.interval,
    price: roundPrice(price),
    direction,
    confidence,
    entry: roundPrice(entry),
    stopLoss: roundPrice(sl),
    targets: [roundPrice(tp1), roundPrice(tp2), roundPrice(tp3)],
    support: roundPrice(Number.isFinite(nearestSupport) ? nearestSupport : recentLow),
    resistance: roundPrice(Number.isFinite(nearestResistance) ? nearestResistance : recentHigh),
    indicators: {
      ema9: roundPrice(e9), ema20: roundPrice(e20), ema50: roundPrice(e50), ema200: roundPrice(e200),
      rsi: r == null ? null : Number(r.toFixed(2)),
      atr: roundPrice(a),
      volumeRatio: Number(volRatio.toFixed(2))
    },
    structure,
    liquidity: sweepLow ? "SELL-SIDE SWEEP" : sweepHigh ? "BUY-SIDE SWEEP" : "NO FRESH SWEEP",
    imbalance: fvgBull ? "BULLISH FVG" : fvgBear ? "BEARISH FVG" : "NONE",
    reasons: direction === "LONG" ? reasonsLong.slice(0, 5) : reasonsShort.slice(0, 5),
    candles
  };
}

async function getKlines(symbol, market, interval = "15m", limit = 250) {
  return binance("/api/v3/klines", market, { symbol, interval, limit });
}

async function futuresKlines(symbol, interval, limit) {
  return binance("/fapi/v1/klines", "futures", { symbol, interval, limit });
}

async function spotKlines(symbol, interval, limit) {
  return binance("/api/v3/klines", "spot", { symbol, interval, limit });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "Rizwan Rai Trader AI", time: new Date().toISOString() });
});

app.get("/api/tickers", async (req, res) => {
  try {
    const market = req.query.market === "spot" ? "spot" : "futures";
    const data = await binance(market === "spot" ? "/api/v3/ticker/24hr" : "/fapi/v1/ticker/24hr", market);
    const rows = data
      .filter(x => String(x.symbol).endsWith("USDT"))
      .filter(x => num(x.quoteVolume) > 1000000)
      .map(x => ({
        symbol: x.symbol,
        price: num(x.lastPrice),
        change: num(x.priceChangePercent),
        volume: num(x.quoteVolume),
        high: num(x.highPrice),
        low: num(x.lowPrice)
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 80);
    res.json({ market, data: rows });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/analyze", async (req, res) => {
  try {
    const market = req.query.market === "spot" ? "spot" : "futures";
    const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = String(req.query.interval || "15m");
    const allowed = new Set(["1m","3m","5m","15m","30m","1h","4h","1d"]);
    if (!allowed.has(interval)) return res.status(400).json({ error: "Unsupported interval" });

    const raw = market === "spot"
      ? await spotKlines(symbol, interval, 250)
      : await futuresKlines(symbol, interval, 250);

    res.json(analyzeCandles(raw, { symbol, market, interval }));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/scanner", async (req, res) => {
  try {
    const market = req.query.market === "spot" ? "spot" : "futures";
    const interval = String(req.query.interval || "15m");
    const tickers = await binance(market === "spot" ? "/api/v3/ticker/24hr" : "/fapi/v1/ticker/24hr", market);
    const candidates = tickers
      .filter(x => String(x.symbol).endsWith("USDT"))
      .filter(x => num(x.quoteVolume) > 5000000)
      .sort((a,b) => Math.abs(num(b.priceChangePercent)) * Math.log10(num(b.quoteVolume)+10) - Math.abs(num(a.priceChangePercent)) * Math.log10(num(a.quoteVolume)+10))
      .slice(0, 8);

    const results = await Promise.all(candidates.map(async t => {
      try {
        const raw = market === "spot"
          ? await spotKlines(t.symbol, interval, 120)
          : await futuresKlines(t.symbol, interval, 120);
        const a = analyzeCandles(raw, { symbol: t.symbol, market, interval });
        return {
          symbol: a.symbol, direction: a.direction, confidence: a.confidence,
          price: a.price, change: num(t.priceChangePercent),
          volume: num(t.quoteVolume), structure: a.structure,
          liquidity: a.liquidity, rsi: a.indicators.rsi
        };
      } catch {
        return null;
      }
    }));

    res.json({ market, interval, scanned: candidates.length, data: results.filter(Boolean).sort((a,b) => b.confidence - a.confidence) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.use((req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, HOST, () => {
  console.log(`Rizwan Rai Trader AI listening on ${HOST}:${PORT}`);
});
