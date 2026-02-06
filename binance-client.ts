import axios, { AxiosInstance } from 'axios';
import { Asset, Portfolio, Trade } from './types';

export class BinanceClient {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(apiKey: string, apiSecret: string, testnet: boolean = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = testnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
      },
    });
  }

  async getPrice(symbol: string): Promise<number> {
    const response = await this.client.get('/ticker/price', {
      params: { symbol: symbol.replace('/', '') },
    });
    return parseFloat(response.data.price);
  }

  async getPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices = await Promise.all(
      symbols.map((symbol) => this.getPrice(symbol))
    );
    return symbols.reduce((acc, symbol, idx) => {
      acc[symbol] = prices[idx];
      return acc;
    }, {} as Record<string, number>);
  }

  async getAccount(): Promise<Portfolio> {
    const response = await this.client.get('/account');
    const balances = response.data.balances;
    
    const assets: Record<string, Asset> = {};
    let cash = 0;

    for (const balance of balances) {
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;

      if (balance.asset === 'USDT' || balance.asset === 'BUSD') {
        cash += total;
      } else if (total > 0) {
        const symbol = `${balance.asset}USDT`;
        try {
          const price = await this.getPrice(symbol);
          assets[symbol] = {
            symbol,
            price,
            holdings: total,
          };
        } catch (error) {
          console.error(`Failed to get price for ${symbol}`);
        }
      }
    }

    return { cash, assets };
  }

  async placeOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price?: number
  ): Promise<Trade> {
    const params: any = {
      symbol: symbol.replace('/', ''),
      side,
      type: price ? 'LIMIT' : 'MARKET',
      quantity: quantity.toFixed(8),
      timestamp: Date.now(),
    };

    if (price) {
      params.price = price.toFixed(8);
      params.timeInForce = 'GTC';
    }

    const signature = this.sign(params);
    params.signature = signature;

    const response = await this.client.post('/order', params);

    return {
      symbol,
      side,
      quantity,
      price: price || parseFloat(response.data.cummulativeQuoteQty) / parseFloat(response.data.executedQty),
      timestamp: Date.now(),
    };
  }

  async getOrderBook(symbol: string, limit: number = 5): Promise<{
    bids: [number, number][];
    asks: [number, number][];
  }> {
    const response = await this.client.get('/depth', {
      params: { symbol: symbol.replace('/', ''), limit },
    });
    return {
      bids: response.data.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: response.data.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
    };
  }

  private sign(params: any): string {
    const crypto = require('crypto');
    const queryString = Object.keys(params)
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }
}
