# Rizwan Rai Trader AI

A separate, professional trading dashboard for the RR Trader ecosystem.

## What is included

- Live Binance Spot and Futures market data
- AI-style scanner for high-volume USDT pairs
- Scalping-oriented LONG / SHORT scoring
- EMA 9/20/50/200 trend checks
- RSI momentum
- ATR-based risk levels
- Relative-volume expansion
- Swing structure and BOS heuristics
- Liquidity sweep heuristics
- Three-candle fair-value-gap / imbalance heuristic
- Live candlestick chart using Lightweight Charts
- Entry, stop-loss and three target projections
- Responsive desktop/mobile dashboard
- Render deployment configuration
- No Binance API key is required for the public market-data endpoints

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:10000`.

## Render

This repository includes `render.yaml`. In Render, create a new Web Service from this GitHub repository. Render will use:

- Build: `npm install`
- Start: `npm start`
- Health check: `/api/health`

No secret environment variables are required for the initial public-data version.

## Important

The signal engine is a rules-based technical analysis system, not a guarantee of profitable trades. Confidence is a ranking score, not a probability of profit. Before live trading, add authentication, persistent signal history, rate-limit protection and any private-account integrations separately.
