import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TICKERS, analyzeMarket } from '@/lib/market';
import { getAllSectors, getSectorForStock, SECTOR_LABELS, type Sector } from '@/lib/market/sectors';
import { cn } from '@/lib/utils';

interface SectorMetrics {
  sector: Sector;
  avgEfficiency: number;
  avgConfidence: number;
  bullishCount: number;
  bearishCount: number;
  cleanCount: number;
  noisyCount: number;
  totalCount: number;
  dominantBias: 'bullish' | 'bearish';
  overallScore: number;
}

export const SectorDashboard = () => {
  const sectorMetrics = useMemo(() => {
    const sectors = getAllSectors();
    const stockTickers = TICKERS.filter(t => t.type === 'stocks');
    
    return sectors.map(sector => {
      const sectorStocks = stockTickers.filter(t => getSectorForStock(t.symbol) === sector);
      
      if (sectorStocks.length === 0) {
        return {
          sector,
          avgEfficiency: 0,
          avgConfidence: 0,
          bullishCount: 0,
          bearishCount: 0,
          cleanCount: 0,
          noisyCount: 0,
          totalCount: 0,
          dominantBias: 'bullish' as const,
          overallScore: 0,
        };
      }
      
      const analyses = sectorStocks.map(t => analyzeMarket(t, '1h'));
      
      const avgEfficiency = analyses.reduce((sum, a) => sum + a.efficiency.score, 0) / analyses.length;
      const avgConfidence = analyses.reduce((sum, a) => sum + a.confidencePercent, 0) / analyses.length;
      const bullishCount = analyses.filter(a => a.bias === 'bullish').length;
      const bearishCount = analyses.filter(a => a.bias === 'bearish').length;
      const cleanCount = analyses.filter(a => a.efficiency.verdict === 'clean').length;
      const noisyCount = analyses.filter(a => a.efficiency.verdict === 'noisy').length;
      
      const dominantBias = bullishCount >= bearishCount ? 'bullish' : 'bearish';
      const overallScore = (avgEfficiency * 50) + (avgConfidence / 2);
      
      return {
        sector,
        avgEfficiency,
        avgConfidence,
        bullishCount,
        bearishCount,
        cleanCount,
        noisyCount,
        totalCount: sectorStocks.length,
        dominantBias,
        overallScore,
      } as SectorMetrics;
    }).filter(s => s.totalCount > 0).sort((a, b) => b.overallScore - a.overallScore);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Sector Analysis
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Market structure and efficiency by sector
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sectorMetrics.map((metrics, index) => (
          <motion.div
            key={metrics.sector}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-display">
                    {SECTOR_LABELS[metrics.sector]}
                  </CardTitle>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      metrics.dominantBias === 'bullish' 
                        ? 'border-[hsl(var(--neural-green))]/50 text-[hsl(var(--neural-green))]' 
                        : 'border-[hsl(var(--neural-red))]/50 text-[hsl(var(--neural-red))]'
                    )}
                  >
                    {metrics.dominantBias === 'bullish' ? (
                      <TrendingUp className="w-3 h-3 mr-1" />
                    ) : (
                      <TrendingDown className="w-3 h-3 mr-1" />
                    )}
                    {metrics.dominantBias}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Efficiency */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Efficiency</span>
                    <span className="text-foreground font-medium">
                      {(metrics.avgEfficiency * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={metrics.avgEfficiency * 100} 
                    className="h-1.5"
                  />
                </div>

                {/* Confidence */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Avg Confidence</span>
                    <span className="text-foreground font-medium">
                      {metrics.avgConfidence.toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={metrics.avgConfidence} 
                    className="h-1.5"
                  />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
                  <div className="text-center">
                    <p className="text-lg font-display font-bold text-[hsl(var(--neural-green))]">
                      {metrics.bullishCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Bullish</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-display font-bold text-[hsl(var(--neural-red))]">
                      {metrics.bearishCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Bearish</p>
                  </div>
                </div>

                {/* Noise indicator */}
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Activity className="w-3 h-3" />
                    <span>Noise Level</span>
                  </div>
                  <span className={cn(
                    "text-xs font-medium",
                    metrics.noisyCount / metrics.totalCount > 0.5 
                      ? 'text-[hsl(var(--neural-orange))]' 
                      : 'text-[hsl(var(--neural-green))]'
                  )}>
                    {metrics.noisyCount} / {metrics.totalCount} noisy
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
