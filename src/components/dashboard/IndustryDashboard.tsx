import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCircle, TrendingUp, TrendingDown, Activity, Factory } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Industry, getAllIndustries, getStocksByIndustry, getIndustryLabel, STOCK_INDUSTRIES } from '@/lib/market/industries';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { getTickerBySymbol, TICKERS } from '@/lib/market/tickers';
import { cn } from '@/lib/utils';

interface IndustryScore {
  industry: Industry;
  sector: string;
  efficiency: number;
  confidence: number;
  bullishRatio: number;
  tickerCount: number;
  topTicker: string;
  avgStrategyState: string;
}

export const IndustryDashboard = () => {
  const [selectedSector, setSelectedSector] = useState<string>('all');
  
  // Calculate industry scores
  const industryScores = useMemo(() => {
    const scores: IndustryScore[] = [];
    const industries = getAllIndustries();
    
    industries.forEach(industry => {
      const symbols = getStocksByIndustry(industry);
      if (symbols.length === 0) return;
      
      let totalEfficiency = 0;
      let totalConfidence = 0;
      let bullishCount = 0;
      let bestTicker = '';
      let bestScore = -1;
      const strategyCounts: Record<string, number> = {};
      let analyzed = 0;
      
      symbols.forEach(symbol => {
        const ticker = getTickerBySymbol(symbol);
        if (!ticker) return;
        
        const analysis = analyzeMarket(ticker, '1h');
        totalEfficiency += analysis.efficiency.score;
        totalConfidence += analysis.confidencePercent;
        
        if (analysis.bias === 'bullish') bullishCount++;
        
        const score = analysis.confidencePercent * analysis.efficiency.score;
        if (score > bestScore) {
          bestScore = score;
          bestTicker = symbol;
        }
        
        strategyCounts[analysis.strategyState] = (strategyCounts[analysis.strategyState] || 0) + 1;
        analyzed++;
      });
      
      if (analyzed === 0) return;
      
      // Find most common strategy state
      const avgStrategy = Object.entries(strategyCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'watching';
      
      const info = STOCK_INDUSTRIES[symbols[0]];
      
      scores.push({
        industry,
        sector: info?.sector || 'Unknown',
        efficiency: totalEfficiency / analyzed,
        confidence: totalConfidence / analyzed,
        bullishRatio: bullishCount / analyzed,
        tickerCount: analyzed,
        topTicker: bestTicker,
        avgStrategyState: avgStrategy,
      });
    });
    
    return scores.sort((a, b) => 
      (b.confidence * b.efficiency) - (a.confidence * a.efficiency)
    );
  }, []);
  
  // Get unique sectors
  const sectors = useMemo(() => {
    const sectorSet = new Set(industryScores.map(s => s.sector));
    return ['all', ...Array.from(sectorSet).sort()];
  }, [industryScores]);
  
  // Filter by sector
  const filteredScores = useMemo(() => {
    if (selectedSector === 'all') return industryScores;
    return industryScores.filter(s => s.sector === selectedSector);
  }, [industryScores, selectedSector]);
  
  const getStrategyColor = (state: string) => {
    switch (state) {
      case 'pressing': return 'bg-neural-green/20 text-neural-green border-neural-green/30';
      case 'tracking': return 'bg-primary/20 text-primary border-primary/30';
      case 'holding': return 'bg-neural-orange/20 text-neural-orange border-neural-orange/30';
      case 'watching': return 'bg-muted text-muted-foreground border-muted';
      case 'avoiding': return 'bg-neural-red/20 text-neural-red border-neural-red/30';
      default: return 'bg-muted text-muted-foreground border-muted';
    }
  };
  
  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Factory className="w-5 h-5 text-primary" />
            <CardTitle className="font-display text-lg">Industry Analysis</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Industries are scored by aggregating QuantLabs metrics across constituent stocks. Higher scores indicate stronger structural conditions.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Badge variant="outline" className="text-xs">
            {filteredScores.length} Industries
          </Badge>
        </div>
        
        {/* Sector filter tabs */}
        <ScrollArea className="w-full">
          <div className="flex gap-1 pt-2">
            {sectors.slice(0, 6).map(sector => (
              <button
                key={sector}
                onClick={() => setSelectedSector(sector)}
                className={cn(
                  'px-3 py-1 text-xs rounded-full border transition-all whitespace-nowrap',
                  selectedSector === sector
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/30 border-border/50 hover:bg-muted/50'
                )}
              >
                {sector === 'all' ? 'All Sectors' : sector}
              </button>
            ))}
          </div>
        </ScrollArea>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {filteredScores.map((score, index) => {
              const isBullish = score.bullishRatio > 0.5;
              const compositeScore = score.confidence * score.efficiency;
              
              return (
                <motion.div
                  key={score.industry}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    'p-4 rounded-xl border transition-all hover:scale-[1.01]',
                    compositeScore > 50 
                      ? 'border-neural-green/30 bg-neural-green/5'
                      : compositeScore < 30
                      ? 'border-neural-red/30 bg-neural-red/5'
                      : 'border-border/50 bg-card/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {getIndustryLabel(score.industry)}
                        </span>
                        {isBullish ? (
                          <TrendingUp className="w-4 h-4 text-neural-green shrink-0" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-neural-red shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {score.sector} • {score.tickerCount} stocks
                      </p>
                      
                      {/* Metrics row */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          Eff: {(score.efficiency * 100).toFixed(0)}%
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Conf: {score.confidence.toFixed(0)}%
                        </Badge>
                        <Badge variant="outline" className={cn('text-xs', getStrategyColor(score.avgStrategyState))}>
                          {score.avgStrategyState.toUpperCase()}
                        </Badge>
                      </div>
                      
                      {/* Top ticker */}
                      <p className="text-xs text-muted-foreground">
                        Top performer: <span className="text-foreground font-medium">{score.topTicker}</span>
                      </p>
                    </div>
                    
                    {/* Composite score gauge */}
                    <div className="text-right shrink-0">
                      <div className={cn(
                        'text-2xl font-bold font-display',
                        compositeScore > 50 ? 'text-neural-green' :
                        compositeScore < 30 ? 'text-neural-red' : 'text-neural-orange'
                      )}>
                        {compositeScore.toFixed(0)}
                      </div>
                      <p className="text-xs text-muted-foreground">Score</p>
                    </div>
                  </div>
                  
                  {/* Bullish/Bearish ratio bar */}
                  <div className="mt-3 h-1.5 bg-neural-red/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-neural-green transition-all"
                      style={{ width: `${score.bullishRatio * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{(score.bullishRatio * 100).toFixed(0)}% Bullish</span>
                    <span>{((1 - score.bullishRatio) * 100).toFixed(0)}% Bearish</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
