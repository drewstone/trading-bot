import { PriceUpdate, Portfolio } from './types';
import { DropRiseStrategy } from './strategy';
import { BacktestingEngine } from './backtesting';

function generatePriceData(symbols: string[]): PriceUpdate[] {
  const data: PriceUpdate[] = [];
  const prices: Record<string, number> = {
    'ETHUSDT': 2000,
    'BTCUSDT': 45000,
    'SOLUSDT': 100,
  };
  
  const basePrices = { ...prices };

  for (let day = 0; day < 30; day++) {
    for (const symbol of symbols) {
      const change = (Math.random() - 0.5) * 0.1;
      prices[symbol] = prices[symbol] * (1 + change);
      
      data.push({
        symbol,
        price: prices[symbol],
        timestamp: Date.now() - (30 - day) * 24 * 60 * 60 * 1000 + Math.random() * 86400000,
      });
    }
  }

  return data.sort((a, b) => a.timestamp - b.timestamp);
}

async function runBacktest() {
  console.log('Running backtest...');

  const initialPortfolio: Portfolio = {
    cash: 100000,
    assets: {
      'ETHUSDT': { symbol: 'ETHUSDT', price: 2000, holdings: 10 },
      'BTCUSDT': { symbol: 'BTCUSDT', price: 45000, holdings: 0.5 },
      'SOLUSDT': { symbol: 'SOLUSDT', price: 100, holdings: 50 },
    },
  };

  const riskLimits = {
    maxPositionSize: 100,
    maxDailyLoss: 0.05,
    maxTradeSize: 50000,
  };

  const strategy = new DropRiseStrategy();
  const engine = new BacktestingEngine(strategy, initialPortfolio, riskLimits);

  const symbols = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
  const priceData = generatePriceData(symbols);

  const result = await engine.run(priceData);

  console.log('\n=== BACKTEST RESULTS ===');
  console.log(`Total Trades: ${result.trades.length}`);
  console.log(`Total Return: ${result.totalReturn.toFixed(2)}%`);
  console.log(`Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
  console.log(`Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`);
  console.log('\nFinal Portfolio:');
  console.log(`Cash: $${result.finalPortfolio.cash.toFixed(2)}`);
  
  for (const [symbol, asset] of Object.entries(result.finalPortfolio.assets)) {
    console.log(`${symbol}: ${asset.holdings.toFixed(6)} @ $${asset.price.toFixed(2)}`);
  }

  console.log('\nLast 10 Trades:');
  const recentTrades = result.trades.slice(-10);
  for (const trade of recentTrades) {
    console.log(`${trade.side} ${trade.quantity.toFixed(6)} ${trade.symbol} @ $${trade.price.toFixed(2)}`);
  }
}

async function runLiveBot() {
  console.log('Starting live bot...');
  
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    console.error('Please set BINANCE_API_KEY and BINANCE_API_SECRET environment variables');
    return;
  }

  const { TradingBot } = await import('./trading-bot');
  
  const strategy = new DropRiseStrategy();
  const riskLimits = {
    maxPositionSize: 100,
    maxDailyLoss: 0.05,
    maxTradeSize: 50000,
  };

  const bot = new TradingBot(
    process.env.BINANCE_API_KEY,
    process.env.BINANCE_API_SECRET,
    strategy,
    riskLimits
  );

  await bot.initialize();
  
  const symbols = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
  await bot.start(symbols);

  process.on('SIGINT', async () => {
    console.log('\nStopping bot...');
    await bot.stop();
    process.exit(0);
  });
}

const mode = process.argv[2];

if (mode === 'backtest') {
  runBacktest().catch(console.error);
} else if (mode === 'live') {
  runLiveBot().catch(console.error);
} else {
  console.log('Usage: npm start [backtest|live]');
  console.log('  backtest - Run backtesting simulation');
  console.log('  live      - Run live trading bot (requires BINANCE_API_KEY and BINANCE_API_SECRET)');
}
