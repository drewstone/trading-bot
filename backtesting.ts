import { Portfolio, PriceUpdate, Trade, BacktestResult, RiskLimits } from './types';
import { IStrategy, TradeSignal } from './strategy';
import { BinanceClient } from './binance-client';

export class BacktestingEngine {
  private strategy: IStrategy;
  private portfolio: Portfolio;
  private trades: Trade[] = [];
  private priceHistory: Map<string, PriceUpdate[]> = new Map();
  private riskLimits: RiskLimits;

  constructor(strategy: IStrategy, initialPortfolio: Portfolio, riskLimits: RiskLimits) {
    this.strategy = strategy;
    this.portfolio = JSON.parse(JSON.stringify(initialPortfolio));
    this.riskLimits = riskLimits;
  }

  async run(priceData: PriceUpdate[]): Promise<BacktestResult> {
    await this.strategy.initialize({
      dropThreshold: 0.05,
      riseThreshold: 0.10,
      buyPercentage: 0.10,
      sellPercentage: 0.20,
      twapSlices: 5,
      twapInterval: 60000,
    });

    for (const update of priceData) {
      await this.processUpdate(update);
    }

    await this.strategy.onEnd();

    const totalValue = this.calculateTotalValue(priceData[priceData.length - 1]);
    const initialValue = this.calculateInitialValue();
    const totalReturn = ((totalValue - initialValue) / initialValue) * 100;

    return {
      trades: this.trades,
      finalPortfolio: { ...this.portfolio },
      totalReturn,
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.calculateMaxDrawdown(),
    };
  }

  private async processUpdate(update: PriceUpdate): Promise<void> {
    const signal = await this.strategy.onUpdate(update);
    if (!signal) return;

    if (signal.action === 'BUY') {
      await this.executeBuy(signal, update);
    } else {
      await this.executeSell(signal, update);
    }
  }

  private async executeBuy(signal: TradeSignal, update: PriceUpdate): Promise<void> {
    const asset = this.portfolio.assets[signal.symbol];
    if (!asset) return;

    const portfolioValue = this.calculateTotalValue(update);
    const buyAmount = portfolioValue * signal.percentage;
    const sliceAmount = buyAmount / 5;

    for (let i = 0; i < 5; i++) {
      if (this.portfolio.cash < sliceAmount) break;

      const quantity = sliceAmount / update.price;
      
      if (this.riskCheck(signal.symbol, quantity, update.price)) {
        this.portfolio.cash -= sliceAmount;
        asset.holdings += quantity;

        this.trades.push({
          symbol: signal.symbol,
          side: 'BUY',
          quantity,
          price: update.price,
          timestamp: update.timestamp + i * 60000,
        });
      }
    }
  }

  private async executeSell(signal: TradeSignal, update: PriceUpdate): Promise<void> {
    const asset = this.portfolio.assets[signal.symbol];
    if (!asset || asset.holdings <= 0) return;

    const sellQuantity = asset.holdings * signal.percentage;
    const sliceQuantity = sellQuantity / 5;

    for (let i = 0; i < 5; i++) {
      const quantity = Math.min(sliceQuantity, asset.holdings);
      
      if (quantity > 0 && this.riskCheck(signal.symbol, quantity, update.price)) {
        asset.holdings -= quantity;
        this.portfolio.cash += quantity * update.price;

        this.trades.push({
          symbol: signal.symbol,
          side: 'SELL',
          quantity,
          price: update.price,
          timestamp: update.timestamp + i * 60000,
        });
      }
    }
  }

  private riskCheck(symbol: string, quantity: number, price: number): boolean {
    const tradeValue = quantity * price;
    return (
      tradeValue <= this.riskLimits.maxTradeSize &&
      quantity <= this.riskLimits.maxPositionSize
    );
  }

  private calculateTotalValue(update: PriceUpdate): number {
    let total = this.portfolio.cash;
    for (const asset of Object.values(this.portfolio.assets)) {
      total += asset.holdings * asset.price;
    }
    return total;
  }

  private calculateInitialValue(): number {
    let total = this.portfolio.cash;
    for (const asset of Object.values(this.portfolio.assets)) {
      total += asset.holdings * asset.price;
    }
    return total;
  }

  private calculateSharpeRatio(): number {
    if (this.trades.length < 2) return 0;
    const returns = this.calculateReturns();
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    return stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }

  private calculateMaxDrawdown(): number {
    let maxDrawdown = 0;
    let peak = this.calculateInitialValue();
    const values = this.trades.map((t) => {
      let total = this.portfolio.cash;
      for (const asset of Object.values(this.portfolio.assets)) {
        if (asset.symbol === t.symbol) {
          total += asset.holdings * t.price;
        } else {
          total += asset.holdings * asset.price;
        }
      }
      return total;
    });

    for (const value of values) {
      if (value > peak) peak = value;
      const drawdown = ((peak - value) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return maxDrawdown;
  }

  private calculateReturns(): number[] {
    const returns: number[] = [];
    let prevValue = this.calculateInitialValue();

    for (const trade of this.trades) {
      let value = this.portfolio.cash;
      for (const asset of Object.values(this.portfolio.assets)) {
        value += asset.holdings * (asset.symbol === trade.symbol ? trade.price : asset.price);
      }
      if (prevValue !== 0) {
        returns.push((value - prevValue) / prevValue);
      }
      prevValue = value;
    }

    return returns;
  }
}
