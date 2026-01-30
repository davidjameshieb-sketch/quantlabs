// Sector definitions and mappings for S&P 500 and NASDAQ stocks
import { TickerInfo } from './types';

export type Sector = 
  | 'Technology'
  | 'Healthcare'
  | 'Financials'
  | 'Consumer Discretionary'
  | 'Consumer Staples'
  | 'Industrials'
  | 'Energy'
  | 'Utilities'
  | 'Real Estate'
  | 'Materials'
  | 'Communication Services';

export const SECTOR_LABELS: Record<Sector, string> = {
  'Technology': 'Technology',
  'Healthcare': 'Healthcare',
  'Financials': 'Financials',
  'Consumer Discretionary': 'Consumer Disc.',
  'Consumer Staples': 'Consumer Staples',
  'Industrials': 'Industrials',
  'Energy': 'Energy',
  'Utilities': 'Utilities',
  'Real Estate': 'Real Estate',
  'Materials': 'Materials',
  'Communication Services': 'Comm. Services',
};

// Map stock symbols to their sectors
export const STOCK_SECTORS: Record<string, Sector> = {
  // Technology
  'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'GOOG': 'Technology',
  'AMZN': 'Technology', 'NVDA': 'Technology', 'META': 'Technology', 'TSLA': 'Technology',
  'AVGO': 'Technology', 'ORCL': 'Technology', 'CSCO': 'Technology', 'CRM': 'Technology',
  'ACN': 'Technology', 'IBM': 'Technology', 'INTC': 'Technology', 'AMD': 'Technology',
  'QCOM': 'Technology', 'TXN': 'Technology', 'NOW': 'Technology', 'INTU': 'Technology',
  'AMAT': 'Technology', 'ADI': 'Technology', 'LRCX': 'Technology', 'MU': 'Technology',
  'KLAC': 'Technology', 'SNPS': 'Technology', 'CDNS': 'Technology', 'ADSK': 'Technology',
  'PANW': 'Technology', 'FTNT': 'Technology', 'MCHP': 'Technology', 'NXPI': 'Technology',
  'ON': 'Technology', 'HPE': 'Technology', 'HPQ': 'Technology', 'KEYS': 'Technology',
  
  // Healthcare
  'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'LLY': 'Healthcare', 'MRK': 'Healthcare',
  'ABBV': 'Healthcare', 'PFE': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare',
  'DHR': 'Healthcare', 'BMY': 'Healthcare', 'AMGN': 'Healthcare', 'MDT': 'Healthcare',
  'ISRG': 'Healthcare', 'GILD': 'Healthcare', 'CVS': 'Healthcare', 'ELV': 'Healthcare',
  'SYK': 'Healthcare', 'VRTX': 'Healthcare', 'REGN': 'Healthcare', 'BSX': 'Healthcare',
  'ZTS': 'Healthcare', 'CI': 'Healthcare', 'HUM': 'Healthcare', 'HCA': 'Healthcare',
  
  // Financials
  'BRK.B': 'Financials', 'JPM': 'Financials', 'V': 'Financials', 'MA': 'Financials',
  'BAC': 'Financials', 'WFC': 'Financials', 'GS': 'Financials', 'MS': 'Financials',
  'BLK': 'Financials', 'SPGI': 'Financials', 'C': 'Financials', 'AXP': 'Financials',
  'SCHW': 'Financials', 'CB': 'Financials', 'MMC': 'Financials', 'PGR': 'Financials',
  'CME': 'Financials', 'ICE': 'Financials', 'AON': 'Financials', 'MCO': 'Financials',
  
  // Consumer Discretionary
  'HD': 'Consumer Discretionary', 'MCD': 'Consumer Discretionary', 'NKE': 'Consumer Discretionary',
  'SBUX': 'Consumer Discretionary', 'TJX': 'Consumer Discretionary', 'LOW': 'Consumer Discretionary',
  'BKNG': 'Consumer Discretionary', 'CMG': 'Consumer Discretionary', 'ORLY': 'Consumer Discretionary',
  'MAR': 'Consumer Discretionary', 'AZO': 'Consumer Discretionary', 'HLT': 'Consumer Discretionary',
  'ROST': 'Consumer Discretionary', 'YUM': 'Consumer Discretionary', 'GM': 'Consumer Discretionary',
  'F': 'Consumer Discretionary',
  
  // Consumer Staples
  'PG': 'Consumer Staples', 'KO': 'Consumer Staples', 'PEP': 'Consumer Staples',
  'COST': 'Consumer Staples', 'WMT': 'Consumer Staples', 'PM': 'Consumer Staples',
  'MO': 'Consumer Staples', 'MDLZ': 'Consumer Staples', 'CL': 'Consumer Staples',
  'TGT': 'Consumer Staples', 'KMB': 'Consumer Staples', 'GIS': 'Consumer Staples',
  
  // Industrials
  'CAT': 'Industrials', 'RTX': 'Industrials', 'GE': 'Industrials', 'BA': 'Industrials',
  'HON': 'Industrials', 'UPS': 'Industrials', 'DE': 'Industrials', 'LMT': 'Industrials',
  'UNP': 'Industrials', 'ETN': 'Industrials', 'GD': 'Industrials', 'NOC': 'Industrials',
  'MMM': 'Industrials', 'ITW': 'Industrials', 'WM': 'Industrials', 'EMR': 'Industrials',
  
  // Energy
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy',
  'EOG': 'Energy', 'MPC': 'Energy', 'PSX': 'Energy', 'VLO': 'Energy',
  'OXY': 'Energy', 'PXD': 'Energy', 'DVN': 'Energy', 'HAL': 'Energy',
  
  // Utilities
  'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities', 'D': 'Utilities',
  'AEP': 'Utilities', 'SRE': 'Utilities', 'EXC': 'Utilities', 'XEL': 'Utilities',
  'ED': 'Utilities', 'PEG': 'Utilities', 'WEC': 'Utilities', 'ES': 'Utilities',
  
  // Real Estate
  'PLD': 'Real Estate', 'AMT': 'Real Estate', 'EQIX': 'Real Estate', 'CCI': 'Real Estate',
  'PSA': 'Real Estate', 'O': 'Real Estate', 'SPG': 'Real Estate', 'WELL': 'Real Estate',
  'DLR': 'Real Estate', 'AVB': 'Real Estate', 'EQR': 'Real Estate', 'VTR': 'Real Estate',
  
  // Materials
  'LIN': 'Materials', 'APD': 'Materials', 'SHW': 'Materials', 'ECL': 'Materials',
  'FCX': 'Materials', 'NEM': 'Materials', 'NUE': 'Materials', 'DOW': 'Materials',
  'DD': 'Materials', 'VMC': 'Materials', 'MLM': 'Materials', 'PPG': 'Materials',
  
  // Communication Services
  'NFLX': 'Communication Services', 'DIS': 'Communication Services', 'CMCSA': 'Communication Services',
  'T': 'Communication Services', 'VZ': 'Communication Services', 'TMUS': 'Communication Services',
  'CHTR': 'Communication Services', 'EA': 'Communication Services', 'TTWO': 'Communication Services',
  'WBD': 'Communication Services', 'PARA': 'Communication Services', 'FOX': 'Communication Services',
};

export const getSectorForStock = (symbol: string): Sector | null => {
  return STOCK_SECTORS[symbol] || null;
};

export const getStocksBySector = (tickers: TickerInfo[], sector: Sector): TickerInfo[] => {
  return tickers.filter(t => t.type === 'stocks' && STOCK_SECTORS[t.symbol] === sector);
};

export const getAllSectors = (): Sector[] => {
  return Object.keys(SECTOR_LABELS) as Sector[];
};
