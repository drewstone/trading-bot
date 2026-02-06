import { PriceUpdate, StrategyConfig } from './types';

export interface IStrategy {
  initialize(config: StrategyConfig): Promise<void>;
  onUpdate(update: PriceUpdate): Promise<TradeSignal | null>;
  onEnd(): Promise<void>;
}

export interface TradeSignal {
  symbol: string;
  action: 'BUY' | 'SELL';
  percentage: number;
  reason: string;
}

export class DropRiseStrategy implements IStrategy {
  private config: StrategyConfig = {
    dropThreshold: 0.05,
    riseThreshold: 0.10,
    buyPercentage: 0.10,
    sellPercentage: 0.20,
    twapSlices: 5,
    twapInterval: 60000,
  };
  private priceHistory: Map<string, number[]> = new Map();
  private initialPrices: Map<string, number> = new Map();

  async initialize(config: StrategyConfig): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  async onUpdate(update: PriceUpdate): Promise<TradeSignal | null> {
    const { symbol, price } = update;

    if (!this.initialPrices.has(symbol)) {
      this.initialPrices.set(symbol, price);
      this.priceHistory.set(symbol, [price]);
      return null;
    }

    const history = this.priceHistory.get(symbol)!;
    history.push(price);
    if (history.length > 100) history.shift();

    const initialPrice = this.initialPrices.get(symbol)!;
    const priceChange = (price - initialPrice) / initialPrice;

    if (priceChange <= -this.config.dropThreshold) {
      return {
        symbol,
        action: 'BUY',
        percentage: this.config.buyPercentage,
        reason: `Price dropped ${Math.abs(priceChange * 100).toFixed(2)}%`,
      };
    }

    if (priceChange >= this.config.riseThreshold) {
      return {
        symbol,
        action: 'SELL',
        percentage: this.config.sellPercentage,
        reason: `Price rose ${(priceChange * 100).toFixed(2)}%`,
      };
    }

    return null;
  }

  async onEnd(): Promise<void> {
    this.priceHistory.clear();
    this.initialPrices.clear();
  }
}
