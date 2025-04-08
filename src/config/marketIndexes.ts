/**
 * Configuration file for major market indexes to track for market sentiment analysis
 */

export interface MarketIndex {
  symbol: string;
  name: string;
  region: 'US' | 'Europe' | 'Asia' | 'Global';
  description: string;
}

/**
 * List of major stock market indexes to analyze for market sentiment
 */
export const MAJOR_INDEXES: MarketIndex[] = [
  // US Indexes
  {
    symbol: "^DJI",
    name: "Dow Jones Industrial Average",
    region: "US",
    description: "Price-weighted average of 30 significant stocks traded on the NYSE and NASDAQ"
  },
  {
    symbol: "^GSPC",
    name: "S&P 500",
    region: "US",
    description: "Market-capitalization-weighted index of the 500 largest U.S. publicly traded companies"
  },
  {
    symbol: "^IXIC",
    name: "NASDAQ Composite",
    region: "US",
    description: "Market-capitalization-weighted index of over 3,000 equities listed on the Nasdaq stock exchange"
  },
  {
    symbol: "^RUT",
    name: "Russell 2000",
    region: "US",
    description: "Small-cap stock market index of the smallest 2,000 stocks in the Russell 3000 Index"
  },
  {
    symbol: "^VIX",
    name: "CBOE Volatility Index",
    region: "US",
    description: "Real-time market index representing the market's expectations for volatility"
  },
  
  // European Indexes
  {
    symbol: "^FTSE",
    name: "FTSE 100",
    region: "Europe",
    description: "Share index of the 100 companies listed on the London Stock Exchange with the highest market capitalization"
  },
  {
    symbol: "^GDAXI",
    name: "DAX",
    region: "Europe",
    description: "Blue chip stock market index consisting of the 40 major German companies trading on the Frankfurt Stock Exchange"
  },
  {
    symbol: "^FCHI",
    name: "CAC 40",
    region: "Europe",
    description: "Benchmark French stock market index, representing a capitalization-weighted measure of the 40 most significant stocks"
  },
  
  // Asian Indexes
  {
    symbol: "^N225",
    name: "Nikkei 225",
    region: "Asia",
    description: "Stock market index for the Tokyo Stock Exchange, price-weighted index of Japan's top 225 companies"
  },
  {
    symbol: "^HSI",
    name: "Hang Seng Index",
    region: "Asia",
    description: "Market capitalization-weighted index of the largest companies that trade on the Hong Kong Exchange"
  },
  {
    symbol: "000001.SS",
    name: "Shanghai Composite",
    region: "Asia",
    description: "Stock market index of all stocks traded at the Shanghai Stock Exchange"
  },
  
  // Global Indexes
  {
    symbol: "^MSCI",
    name: "MSCI World Index",
    region: "Global",
    description: "Market cap weighted stock market index of 1,586 companies throughout the world"
  }
];

/**
 * Get symbols of all market indexes
 */
export function getIndexSymbols(): string[] {
  return MAJOR_INDEXES.map(index => index.symbol);
}