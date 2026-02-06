export interface Asset {
  symbol: string;
  price: number;
  holdings: number;
}

export interface Portfolio {
  cash: number;
  assets: Record<string, Asset>;
}

export interface Trade {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: number;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface RiskLimits {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTradeSize: number;
}

export interface StrategyConfig {
  dropThreshold: number;
  riseThreshold: number;
  buyPercentage: number;
  sellPercentage: number;
  twapSlices: number;
  twapInterval: number;
}

export interface BacktestResult {
  trades: Trade[];
  finalPortfolio: Portfolio;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
}
