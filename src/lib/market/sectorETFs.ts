// S&P 500 Sector ETFs (SPDR Select Sector series)
import { TickerInfo } from './types';

export interface SectorETF extends TickerInfo {
  sectorName: string;
  sectorCode: string;
}

// All 11 S&P 500 Sector ETFs
export const SECTOR_ETFS: SectorETF[] = [
  { symbol: 'XLB', name: 'Materials Select Sector SPDR', type: 'indices', sectorName: 'Materials', sectorCode: 'materials' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', type: 'indices', sectorName: 'Energy', sectorCode: 'energy' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', type: 'indices', sectorName: 'Financials', sectorCode: 'financials' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR', type: 'indices', sectorName: 'Industrials', sectorCode: 'industrials' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR', type: 'indices', sectorName: 'Technology', sectorCode: 'technology' },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR', type: 'indices', sectorName: 'Consumer Staples', sectorCode: 'consumer-staples' },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR', type: 'indices', sectorName: 'Utilities', sectorCode: 'utilities' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR', type: 'indices', sectorName: 'Health Care', sectorCode: 'healthcare' },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR', type: 'indices', sectorName: 'Consumer Discretionary', sectorCode: 'consumer-discretionary' },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR', type: 'indices', sectorName: 'Real Estate', sectorCode: 'real-estate' },
  { symbol: 'XLC', name: 'Communication Services Select Sector SPDR', type: 'indices', sectorName: 'Communication Services', sectorCode: 'communication-services' },
];

// Market baseline reference
export const MARKET_BASELINE: TickerInfo = {
  symbol: 'SPY',
  name: 'SPDR S&P 500 ETF Trust',
  type: 'indices',
};

// Get all sector ETF symbols
export const getSectorETFSymbols = (): string[] => {
  return SECTOR_ETFS.map(etf => etf.symbol);
};

// Get sector ETF by symbol
export const getSectorETFBySymbol = (symbol: string): SectorETF | undefined => {
  return SECTOR_ETFS.find(etf => etf.symbol === symbol);
};

// Check if a symbol is a sector ETF
export const isSectorETF = (symbol: string): boolean => {
  return SECTOR_ETFS.some(etf => etf.symbol === symbol);
};

// Get sector name for display
export const getSectorNameFromSymbol = (symbol: string): string | undefined => {
  return getSectorETFBySymbol(symbol)?.sectorName;
};
