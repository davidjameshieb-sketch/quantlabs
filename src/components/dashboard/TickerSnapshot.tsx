import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MARKET_LABELS, TIMEFRAME_LABELS } from '@/lib/market';
import { TickerInfo, BiasDirection, Timeframe } from '@/lib/market/types';
import { cn } from '@/lib/utils';

interface TickerSnapshotProps {
  ticker: TickerInfo;
  analysis: {
    analyses: Record<Timeframe, {
      bias: BiasDirection;
      confidencePercent: number;
      efficiency: { verdict: string; score: number };
      strategyState: string;
    }>;
    dominantBias: BiasDirection;
    alignmentLevel: string;
    aggregatedScore: number;
  };
  primaryAnalysis: {
    bias: BiasDirection;
    confidencePercent: number;
    efficiency: { verdict: string; score: number };
    strategyState: string;
  };
  onClose: () => void;
}

const biasColors: Record<BiasDirection, string> = {
  bullish: 'text-neural-green',
  bearish: 'text-neural-red',
};

const biasBgColors: Record<BiasDirection, string> = {
  bullish: 'bg-neural-green/20 border-neural-green/30',
  bearish: 'bg-neural-red/20 border-neural-red/30',
};

export const TickerSnapshot = ({ 
  ticker, 
  analysis, 
  primaryAnalysis, 
  onClose 
}: TickerSnapshotProps) => {
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!snapshotRef.current) return;
    
    setIsDownloading(true);
    
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(snapshotRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const link = document.createElement('a');
      link.download = `${ticker.symbol}-analysis-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to generate snapshot:', err);
    } finally {
      setIsDownloading(false);
    }
  }, [ticker.symbol]);

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative max-w-2xl w-full max-h-[90vh] overflow-auto rounded-xl border border-border bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border bg-card/95 backdrop-blur-sm">
            <h2 className="font-display text-lg font-semibold">Shareable Snapshot</h2>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownload}
                disabled={isDownloading}
                className="gap-2"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : downloadSuccess ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloadSuccess ? 'Downloaded!' : 'Download PNG'}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Snapshot content - this is what gets captured */}
          <div
            ref={snapshotRef}
            className="p-6 bg-background"
            style={{ minWidth: '500px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-3xl font-bold text-foreground">
                    {ticker.symbol}
                  </h1>
                  <Badge variant="outline" className="text-xs">
                    {MARKET_LABELS[ticker.type]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('text-sm font-bold uppercase', biasBgColors[primaryAnalysis.bias])}
                  >
                    {primaryAnalysis.bias}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">{ticker.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">As of</p>
                <p className="text-sm font-medium">{currentDate}</p>
              </div>
            </div>

            {/* Main metrics */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Confidence</p>
                <p className="font-display text-2xl font-bold text-foreground">
                  {primaryAnalysis.confidencePercent.toFixed(0)}%
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Efficiency</p>
                <p className="font-display text-2xl font-bold text-foreground uppercase">
                  {primaryAnalysis.efficiency.verdict}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Strategy</p>
                <p className="font-display text-2xl font-bold text-foreground uppercase">
                  {primaryAnalysis.strategyState}
                </p>
              </div>
            </div>

            {/* MTF Summary */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Multi-Timeframe Alignment
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    analysis.alignmentLevel === 'aligned'
                      ? 'bg-neural-green/20 text-neural-green border-neural-green/30'
                      : analysis.alignmentLevel === 'conflicting'
                      ? 'bg-neural-red/20 text-neural-red border-neural-red/30'
                      : 'bg-neural-orange/20 text-neural-orange border-neural-orange/30'
                  )}
                >
                  {analysis.alignmentLevel.toUpperCase()}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(analysis.analyses).map(([tf, tfAnalysis]) => (
                  <div
                    key={tf}
                    className={cn(
                      'p-3 rounded-lg border text-center',
                      biasBgColors[tfAnalysis.bias]
                    )}
                  >
                    <p className="text-xs font-medium mb-1">
                      {TIMEFRAME_LABELS[tf as Timeframe]}
                    </p>
                    <p className={cn('text-sm font-bold uppercase', biasColors[tfAnalysis.bias])}>
                      {tfAnalysis.bias}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tfAnalysis.confidencePercent.toFixed(0)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Aggregated Score */}
            <div className="p-4 rounded-lg bg-muted/50 border border-border/50 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Aggregated Bias Score</p>
                  <p className="font-display text-3xl font-bold">
                    {analysis.aggregatedScore > 0 ? '+' : ''}
                    {(analysis.aggregatedScore * 100).toFixed(1)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn('text-lg px-4 py-2 font-bold', biasBgColors[analysis.dominantBias])}
                >
                  {analysis.dominantBias.toUpperCase()}
                </Badge>
              </div>
            </div>

            {/* Branding - subtle, bottom-right */}
            <div className="flex items-center justify-end pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground/60">
                Powered by <span className="font-medium text-muted-foreground/80">CustomQuantLabs.com</span>
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
