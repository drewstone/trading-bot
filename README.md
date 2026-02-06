# Binance Trading Bot

TypeScript trading bot using Binance Advanced Trade API with typed client, strategy interface, backtesting harness, and live execution with risk limits.

## Features

- **Typed Binance Client**: Full TypeScript integration with Binance API
- **Strategy Interface**: Pluggable strategy pattern
- **Backtesting Engine**: Historical simulation with performance metrics
- **Live Execution**: Real trading with TWAP (Time-Weighted Average Price)
- **Risk Management**: Configurable position size, daily loss, and trade limits
- **Multi-Asset Support**: Trade ETH, BTC, SOL simultaneously

## Strategy Logic

- **BUY**: When price drops 5% from initial price, TWAP buy 10% of liquid portfolio (5 slices over 5 minutes)
- **SELL**: When price rises 10% from initial price, TWAP sell 20% of holdings (5 slices over 5 minutes)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and add your Binance API credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
```

## Usage

### Run Backtest

```bash
npm start backtest
```

### Run Live Bot

```bash
npm start live
```

Press `Ctrl+C` to stop the bot gracefully.

## Risk Limits

Adjust these in `index.ts` or pass custom values:

```typescript
{
  maxPositionSize: 100,      // Maximum units per position
  maxDailyLoss: 0.05,        // 5% maximum daily loss
  maxTradeSize: 50000        // Maximum $ value per trade
}
```

## Project Structure

- `types.ts` - TypeScript interfaces
- `binance-client.ts` - Binance API client
- `strategy.ts` - Strategy interface and implementation
- `backtesting.ts` - Backtesting engine
- `trading-bot.ts` - Live bot executor
- `index.ts` - Entry point
