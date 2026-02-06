import { BinanceClient } from './binance-client';
import { DropRiseStrategy, IStrategy } from './strategy';
import { Portfolio, RiskLimits, Trade } from './types';
import { BacktestingEngine } from './backtesting';
import * as dotenv from 'dotenv';

dotenv.config();

export class TradingBot {
  private client: BinanceClient;
  private strategy: IStrategy;
  private portfolio: Portfolio;
  private riskLimits: RiskLimits;
  private isRunning: boolean = false;
  private priceIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    apiKey: string,
    apiSecret: string,
    strategy: IStrategy,
    riskLimits: RiskLimits
  ) {
    this.client = new BinanceClient(apiKey, apiSecret, true);
    this.strategy = strategy;
    this.riskLimits = riskLimits;
    this.portfolio = { cash: 0, assets: {} };
  }

  async initialize(): Promise<void> {
    this.portfolio = await this.client.getAccount();
    console.log('Portfolio initialized:', this.portfolio);

    await this.strategy.initialize({
      dropThreshold: 0.05,
      riseThreshold: 0.10,
      buyPercentage: 0.10,
      sellPercentage: 0.20,
      twapSlices: 5,
      twapInterval: 60000,
    });
  }

  async start(symbols: string[]): Promise<void> {
    if (this.isRunning) {
      console.log('Bot is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting bot for symbols: ${symbols.join(', ')}`);

    for (const symbol of symbols) {
      await this.trackSymbol(symbol);
    }
  }

  private async trackSymbol(symbol: string): Promise<void> {
    const checkInterval = async () => {
      try {
        const price = await this.client.getPrice(symbol);
        const update = { symbol, price, timestamp: Date.now() };
        
        const signal = await this.strategy.onUpdate(update);
        
        if (signal) {
          console.log(`Signal received: ${signal.action} ${signal.symbol} (${signal.reason})`);
          await this.executeSignal(signal);
        }
      } catch (error) {
        console.error(`Error tracking ${symbol}:`, error);
      }
    };

    await checkInterval();
    const interval = setInterval(checkInterval, 60000);
    this.priceIntervals.set(symbol, interval);
  }

  private async executeSignal(signal: any): Promise<void> {
    const asset = this.portfolio.assets[signal.symbol];
    const portfolioValue = this.calculatePortfolioValue();

    try {
      if (signal.action === 'BUY' && asset) {
        const totalBuyAmount = portfolioValue * signal.percentage;
        const sliceAmount = totalBuyAmount / 5;
        const price = await this.client.getPrice(signal.symbol);

        for (let i = 0; i < 5; i++) {
          if (this.portfolio.cash < sliceAmount) break;
          
          const quantity = sliceAmount / price;
          
          if (this.validateTrade(signal.symbol, quantity, price)) {
            await this.client.placeOrder(signal.symbol, 'BUY', quantity);
            this.portfolio.cash -= sliceAmount;
            asset.holdings += quantity;
            console.log(`Bought ${quantity.toFixed(6)} ${signal.symbol} at ${price}`);
            
            await new Promise(resolve => setTimeout(resolve, 60000));
          }
        }
      } else if (signal.action === 'SELL' && asset && asset.holdings > 0) {
        const totalSellQuantity = asset.holdings * signal.percentage;
        const sliceQuantity = totalSellQuantity / 5;
        const price = await this.client.getPrice(signal.symbol);

        for (let i = 0; i < 5; i++) {
          const quantity = Math.min(sliceQuantity, asset.holdings);
          
          if (quantity > 0 && this.validateTrade(signal.symbol, quantity, price)) {
            await this.client.placeOrder(signal.symbol, 'SELL', quantity);
            asset.holdings -= quantity;
            this.portfolio.cash += quantity * price;
            console.log(`Sold ${quantity.toFixed(6)} ${signal.symbol} at ${price}`);
            
            await new Promise(resolve => setTimeout(resolve, 60000));
          }
        }
      }
    } catch (error) {
      console.error('Error executing signal:', error);
    }
  }

  private validateTrade(symbol: string, quantity: number, price: number): boolean {
    const tradeValue = quantity * price;
    return (
      tradeValue <= this.riskLimits.maxTradeSize &&
      quantity <= this.riskLimits.maxPositionSize &&
      tradeValue <= this.portfolio.cash * (1 + this.riskLimits.maxDailyLoss)
    );
  }

  private calculatePortfolioValue(): number {
    let total = this.portfolio.cash;
    for (const asset of Object.values(this.portfolio.assets)) {
      total += asset.holdings * asset.price;
    }
    return total;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    for (const [symbol, interval] of this.priceIntervals) {
      clearInterval(interval);
      console.log(`Stopped tracking ${symbol}`);
    }
    
    this.priceIntervals.clear();
    await this.strategy.onEnd();
    console.log('Bot stopped');
  }

  getPortfolio(): Portfolio {
    return { ...this.portfolio };
  }
}
