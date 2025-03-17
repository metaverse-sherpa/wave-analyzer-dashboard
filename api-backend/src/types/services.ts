export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  volume: number;
}

export interface BackendHealthCheck {
  status: 'ok' | 'error';
  message: string;
  timestamp: Date;
}