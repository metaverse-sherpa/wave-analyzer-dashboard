// Configuration for market indexes

export interface MarketIndex {
  symbol: string;
  name: string;
  description?: string;
}

export const marketIndexes: MarketIndex[] = [
  {
    symbol: 'SPY',
    name: 'S&P 500',
    description: 'Standard & Poor\'s 500 Index'
  },
  {
    symbol: 'QQQ',
    name: 'Nasdaq-100',
    description: 'Invesco QQQ Trust (tracks NASDAQ-100 Index)'
  },
  {
    symbol: 'DIA',
    name: 'Dow Jones',
    description: 'SPDR Dow Jones Industrial Average ETF'
  },
  {
    symbol: 'IWM',
    name: 'Russell 2000',
    description: 'iShares Russell 2000 ETF'
  },
  {
    symbol: 'VTI',
    name: 'Total Market',
    description: 'Vanguard Total Stock Market ETF'
  },
  {
    symbol: 'EFA',
    name: 'Intl Developed',
    description: 'iShares MSCI EAFE ETF (International Developed Markets)'
  }
];

// Add MAJOR_INDEXES constant that aiMarketService.ts is trying to import
export const MAJOR_INDEXES = {
  'S&P 500': 'SPY',
  'NASDAQ': 'QQQ',
  'Dow Jones': 'DIA',
  'Russell 2000': 'IWM'
};

// Add getIndexSymbols function that aiMarketService.ts is trying to import
export function getIndexSymbols(): string[] {
  return Object.values(MAJOR_INDEXES);
}

// Function to get a market index by symbol
export function getMarketIndexBySymbol(symbol: string): MarketIndex | undefined {
  return marketIndexes.find(index => index.symbol === symbol);
}

export default marketIndexes;