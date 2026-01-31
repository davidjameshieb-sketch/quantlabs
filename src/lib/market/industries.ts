// Industry classifications for comprehensive stock coverage
// Each stock maps to both a Sector and an Industry

export type Industry = 
  // Technology Industries
  | 'Software—Infrastructure'
  | 'Software—Application'
  | 'Semiconductors'
  | 'Consumer Electronics'
  | 'Internet Content & Information'
  | 'IT Services'
  | 'Electronic Components'
  | 'Scientific Instruments'
  | 'Communication Equipment'
  // Healthcare Industries
  | 'Drug Manufacturers—General'
  | 'Drug Manufacturers—Specialty'
  | 'Biotechnology'
  | 'Medical Devices'
  | 'Healthcare Plans'
  | 'Healthcare Providers'
  | 'Diagnostics & Research'
  // Financials Industries
  | 'Banks—Diversified'
  | 'Banks—Regional'
  | 'Credit Services'
  | 'Insurance—Life'
  | 'Insurance—Property & Casualty'
  | 'Asset Management'
  | 'Capital Markets'
  | 'Financial Data & Exchanges'
  // Consumer Industries
  | 'Internet Retail'
  | 'Home Improvement'
  | 'Restaurants'
  | 'Apparel Retail'
  | 'Auto Manufacturers'
  | 'Lodging'
  | 'Leisure'
  | 'Specialty Retail'
  | 'Beverages—Soft Drinks'
  | 'Beverages—Alcoholic'
  | 'Household Products'
  | 'Packaged Foods'
  | 'Tobacco'
  | 'Discount Stores'
  // Industrial Industries
  | 'Aerospace & Defense'
  | 'Railroads'
  | 'Farm & Heavy Equipment'
  | 'Specialty Industrial Machinery'
  | 'Integrated Freight & Logistics'
  | 'Waste Management'
  | 'Building Products'
  | 'Electrical Equipment'
  // Energy Industries
  | 'Oil & Gas Integrated'
  | 'Oil & Gas E&P'
  | 'Oil & Gas Refining'
  | 'Oil & Gas Services'
  // Other Industries
  | 'REIT—Industrial'
  | 'REIT—Data Center'
  | 'REIT—Retail'
  | 'REIT—Residential'
  | 'REIT—Healthcare'
  | 'Utilities—Regulated Electric'
  | 'Utilities—Diversified'
  | 'Specialty Chemicals'
  | 'Steel'
  | 'Gold'
  | 'Copper'
  | 'Building Materials'
  | 'Entertainment'
  | 'Telecom Services'
  | 'Broadcasting'
  | 'Publishing';

export interface IndustryInfo {
  industry: Industry;
  sector: string;
}

// Map stock symbols to their industries
export const STOCK_INDUSTRIES: Record<string, IndustryInfo> = {
  // Technology - Software
  'AAPL': { industry: 'Consumer Electronics', sector: 'Technology' },
  'MSFT': { industry: 'Software—Infrastructure', sector: 'Technology' },
  'GOOGL': { industry: 'Internet Content & Information', sector: 'Technology' },
  'GOOG': { industry: 'Internet Content & Information', sector: 'Technology' },
  'AMZN': { industry: 'Internet Retail', sector: 'Consumer Discretionary' },
  'NVDA': { industry: 'Semiconductors', sector: 'Technology' },
  'META': { industry: 'Internet Content & Information', sector: 'Technology' },
  'TSLA': { industry: 'Auto Manufacturers', sector: 'Consumer Discretionary' },
  'AVGO': { industry: 'Semiconductors', sector: 'Technology' },
  'ORCL': { industry: 'Software—Infrastructure', sector: 'Technology' },
  'CSCO': { industry: 'Communication Equipment', sector: 'Technology' },
  'CRM': { industry: 'Software—Application', sector: 'Technology' },
  'ACN': { industry: 'IT Services', sector: 'Technology' },
  'IBM': { industry: 'IT Services', sector: 'Technology' },
  'INTC': { industry: 'Semiconductors', sector: 'Technology' },
  'AMD': { industry: 'Semiconductors', sector: 'Technology' },
  'QCOM': { industry: 'Semiconductors', sector: 'Technology' },
  'TXN': { industry: 'Semiconductors', sector: 'Technology' },
  'NOW': { industry: 'Software—Application', sector: 'Technology' },
  'INTU': { industry: 'Software—Application', sector: 'Technology' },
  'AMAT': { industry: 'Semiconductors', sector: 'Technology' },
  'ADI': { industry: 'Semiconductors', sector: 'Technology' },
  'LRCX': { industry: 'Semiconductors', sector: 'Technology' },
  'MU': { industry: 'Semiconductors', sector: 'Technology' },
  'KLAC': { industry: 'Semiconductors', sector: 'Technology' },
  'SNPS': { industry: 'Software—Infrastructure', sector: 'Technology' },
  'CDNS': { industry: 'Software—Application', sector: 'Technology' },
  'ADSK': { industry: 'Software—Application', sector: 'Technology' },
  'PANW': { industry: 'Software—Infrastructure', sector: 'Technology' },
  'FTNT': { industry: 'Software—Infrastructure', sector: 'Technology' },
  
  // Healthcare
  'UNH': { industry: 'Healthcare Plans', sector: 'Healthcare' },
  'JNJ': { industry: 'Drug Manufacturers—General', sector: 'Healthcare' },
  'LLY': { industry: 'Drug Manufacturers—General', sector: 'Healthcare' },
  'MRK': { industry: 'Drug Manufacturers—General', sector: 'Healthcare' },
  'ABBV': { industry: 'Drug Manufacturers—General', sector: 'Healthcare' },
  'PFE': { industry: 'Drug Manufacturers—General', sector: 'Healthcare' },
  'TMO': { industry: 'Diagnostics & Research', sector: 'Healthcare' },
  'ABT': { industry: 'Medical Devices', sector: 'Healthcare' },
  'DHR': { industry: 'Diagnostics & Research', sector: 'Healthcare' },
  'BMY': { industry: 'Drug Manufacturers—General', sector: 'Healthcare' },
  'AMGN': { industry: 'Biotechnology', sector: 'Healthcare' },
  'MDT': { industry: 'Medical Devices', sector: 'Healthcare' },
  'ISRG': { industry: 'Medical Devices', sector: 'Healthcare' },
  'GILD': { industry: 'Biotechnology', sector: 'Healthcare' },
  'CVS': { industry: 'Healthcare Providers', sector: 'Healthcare' },
  'ELV': { industry: 'Healthcare Plans', sector: 'Healthcare' },
  'VRTX': { industry: 'Biotechnology', sector: 'Healthcare' },
  'REGN': { industry: 'Biotechnology', sector: 'Healthcare' },
  
  // Financials
  'BRK.B': { industry: 'Insurance—Property & Casualty', sector: 'Financials' },
  'JPM': { industry: 'Banks—Diversified', sector: 'Financials' },
  'V': { industry: 'Credit Services', sector: 'Financials' },
  'MA': { industry: 'Credit Services', sector: 'Financials' },
  'BAC': { industry: 'Banks—Diversified', sector: 'Financials' },
  'WFC': { industry: 'Banks—Diversified', sector: 'Financials' },
  'GS': { industry: 'Capital Markets', sector: 'Financials' },
  'MS': { industry: 'Capital Markets', sector: 'Financials' },
  'BLK': { industry: 'Asset Management', sector: 'Financials' },
  'SPGI': { industry: 'Financial Data & Exchanges', sector: 'Financials' },
  'C': { industry: 'Banks—Diversified', sector: 'Financials' },
  'AXP': { industry: 'Credit Services', sector: 'Financials' },
  'SCHW': { industry: 'Capital Markets', sector: 'Financials' },
  'CME': { industry: 'Financial Data & Exchanges', sector: 'Financials' },
  'ICE': { industry: 'Financial Data & Exchanges', sector: 'Financials' },
  'PGR': { industry: 'Insurance—Property & Casualty', sector: 'Financials' },
  
  // Consumer Discretionary
  'HD': { industry: 'Home Improvement', sector: 'Consumer Discretionary' },
  'MCD': { industry: 'Restaurants', sector: 'Consumer Discretionary' },
  'NKE': { industry: 'Apparel Retail', sector: 'Consumer Discretionary' },
  'SBUX': { industry: 'Restaurants', sector: 'Consumer Discretionary' },
  'TJX': { industry: 'Apparel Retail', sector: 'Consumer Discretionary' },
  'LOW': { industry: 'Home Improvement', sector: 'Consumer Discretionary' },
  'BKNG': { industry: 'Internet Retail', sector: 'Consumer Discretionary' },
  'CMG': { industry: 'Restaurants', sector: 'Consumer Discretionary' },
  'MAR': { industry: 'Lodging', sector: 'Consumer Discretionary' },
  'HLT': { industry: 'Lodging', sector: 'Consumer Discretionary' },
  'GM': { industry: 'Auto Manufacturers', sector: 'Consumer Discretionary' },
  'F': { industry: 'Auto Manufacturers', sector: 'Consumer Discretionary' },
  
  // Consumer Staples
  'PG': { industry: 'Household Products', sector: 'Consumer Staples' },
  'KO': { industry: 'Beverages—Soft Drinks', sector: 'Consumer Staples' },
  'PEP': { industry: 'Beverages—Soft Drinks', sector: 'Consumer Staples' },
  'COST': { industry: 'Discount Stores', sector: 'Consumer Staples' },
  'WMT': { industry: 'Discount Stores', sector: 'Consumer Staples' },
  'PM': { industry: 'Tobacco', sector: 'Consumer Staples' },
  'MO': { industry: 'Tobacco', sector: 'Consumer Staples' },
  'MDLZ': { industry: 'Packaged Foods', sector: 'Consumer Staples' },
  'CL': { industry: 'Household Products', sector: 'Consumer Staples' },
  'TGT': { industry: 'Discount Stores', sector: 'Consumer Staples' },
  'KMB': { industry: 'Household Products', sector: 'Consumer Staples' },
  'GIS': { industry: 'Packaged Foods', sector: 'Consumer Staples' },
  
  // Industrials
  'CAT': { industry: 'Farm & Heavy Equipment', sector: 'Industrials' },
  'RTX': { industry: 'Aerospace & Defense', sector: 'Industrials' },
  'GE': { industry: 'Aerospace & Defense', sector: 'Industrials' },
  'BA': { industry: 'Aerospace & Defense', sector: 'Industrials' },
  'HON': { industry: 'Specialty Industrial Machinery', sector: 'Industrials' },
  'UPS': { industry: 'Integrated Freight & Logistics', sector: 'Industrials' },
  'DE': { industry: 'Farm & Heavy Equipment', sector: 'Industrials' },
  'LMT': { industry: 'Aerospace & Defense', sector: 'Industrials' },
  'UNP': { industry: 'Railroads', sector: 'Industrials' },
  'ETN': { industry: 'Specialty Industrial Machinery', sector: 'Industrials' },
  'GD': { industry: 'Aerospace & Defense', sector: 'Industrials' },
  'NOC': { industry: 'Aerospace & Defense', sector: 'Industrials' },
  'WM': { industry: 'Waste Management', sector: 'Industrials' },
  'FDX': { industry: 'Integrated Freight & Logistics', sector: 'Industrials' },
  
  // Energy
  'XOM': { industry: 'Oil & Gas Integrated', sector: 'Energy' },
  'CVX': { industry: 'Oil & Gas Integrated', sector: 'Energy' },
  'COP': { industry: 'Oil & Gas E&P', sector: 'Energy' },
  'SLB': { industry: 'Oil & Gas Services', sector: 'Energy' },
  'EOG': { industry: 'Oil & Gas E&P', sector: 'Energy' },
  'MPC': { industry: 'Oil & Gas Refining', sector: 'Energy' },
  'PSX': { industry: 'Oil & Gas Refining', sector: 'Energy' },
  'VLO': { industry: 'Oil & Gas Refining', sector: 'Energy' },
  'OXY': { industry: 'Oil & Gas E&P', sector: 'Energy' },
  'HAL': { industry: 'Oil & Gas Services', sector: 'Energy' },
  
  // Utilities
  'NEE': { industry: 'Utilities—Regulated Electric', sector: 'Utilities' },
  'DUK': { industry: 'Utilities—Regulated Electric', sector: 'Utilities' },
  'SO': { industry: 'Utilities—Regulated Electric', sector: 'Utilities' },
  'D': { industry: 'Utilities—Diversified', sector: 'Utilities' },
  'AEP': { industry: 'Utilities—Regulated Electric', sector: 'Utilities' },
  'SRE': { industry: 'Utilities—Diversified', sector: 'Utilities' },
  'EXC': { industry: 'Utilities—Regulated Electric', sector: 'Utilities' },
  'XEL': { industry: 'Utilities—Regulated Electric', sector: 'Utilities' },
  
  // Real Estate
  'PLD': { industry: 'REIT—Industrial', sector: 'Real Estate' },
  'AMT': { industry: 'REIT—Data Center', sector: 'Real Estate' },
  'EQIX': { industry: 'REIT—Data Center', sector: 'Real Estate' },
  'CCI': { industry: 'REIT—Data Center', sector: 'Real Estate' },
  'PSA': { industry: 'REIT—Industrial', sector: 'Real Estate' },
  'O': { industry: 'REIT—Retail', sector: 'Real Estate' },
  'SPG': { industry: 'REIT—Retail', sector: 'Real Estate' },
  'WELL': { industry: 'REIT—Healthcare', sector: 'Real Estate' },
  'DLR': { industry: 'REIT—Data Center', sector: 'Real Estate' },
  'AVB': { industry: 'REIT—Residential', sector: 'Real Estate' },
  
  // Materials
  'LIN': { industry: 'Specialty Chemicals', sector: 'Materials' },
  'APD': { industry: 'Specialty Chemicals', sector: 'Materials' },
  'SHW': { industry: 'Specialty Chemicals', sector: 'Materials' },
  'ECL': { industry: 'Specialty Chemicals', sector: 'Materials' },
  'FCX': { industry: 'Copper', sector: 'Materials' },
  'NEM': { industry: 'Gold', sector: 'Materials' },
  'NUE': { industry: 'Steel', sector: 'Materials' },
  'DOW': { industry: 'Specialty Chemicals', sector: 'Materials' },
  'VMC': { industry: 'Building Materials', sector: 'Materials' },
  'MLM': { industry: 'Building Materials', sector: 'Materials' },
  
  // Communication Services
  'NFLX': { industry: 'Entertainment', sector: 'Communication Services' },
  'DIS': { industry: 'Entertainment', sector: 'Communication Services' },
  'CMCSA': { industry: 'Telecom Services', sector: 'Communication Services' },
  'T': { industry: 'Telecom Services', sector: 'Communication Services' },
  'VZ': { industry: 'Telecom Services', sector: 'Communication Services' },
  'TMUS': { industry: 'Telecom Services', sector: 'Communication Services' },
  'CHTR': { industry: 'Telecom Services', sector: 'Communication Services' },
  'EA': { industry: 'Entertainment', sector: 'Communication Services' },
  'TTWO': { industry: 'Entertainment', sector: 'Communication Services' },
};

// Get all unique industries
export const getAllIndustries = (): Industry[] => {
  const industries = new Set<Industry>();
  Object.values(STOCK_INDUSTRIES).forEach(info => industries.add(info.industry));
  return Array.from(industries).sort();
};

// Get industry for a stock
export const getIndustryForStock = (symbol: string): IndustryInfo | null => {
  return STOCK_INDUSTRIES[symbol] || null;
};

// Get stocks by industry
export const getStocksByIndustry = (industry: Industry): string[] => {
  return Object.entries(STOCK_INDUSTRIES)
    .filter(([_, info]) => info.industry === industry)
    .map(([symbol]) => symbol);
};

// Get industries in a sector
export const getIndustriesInSector = (sector: string): Industry[] => {
  const industries = new Set<Industry>();
  Object.values(STOCK_INDUSTRIES)
    .filter(info => info.sector === sector)
    .forEach(info => industries.add(info.industry));
  return Array.from(industries);
};

// Industry display labels (shortened for UI)
export const INDUSTRY_LABELS: Partial<Record<Industry, string>> = {
  'Software—Infrastructure': 'Software Infra',
  'Software—Application': 'Software Apps',
  'Drug Manufacturers—General': 'Drug Mfg',
  'Drug Manufacturers—Specialty': 'Specialty Drugs',
  'Insurance—Property & Casualty': 'P&C Insurance',
  'Insurance—Life': 'Life Insurance',
  'Oil & Gas Integrated': 'Oil & Gas',
  'Oil & Gas E&P': 'E&P',
  'Oil & Gas Refining': 'Refining',
  'Utilities—Regulated Electric': 'Electric Util',
  'Utilities—Diversified': 'Diversified Util',
};

export const getIndustryLabel = (industry: Industry): string => {
  return INDUSTRY_LABELS[industry] || industry;
};
