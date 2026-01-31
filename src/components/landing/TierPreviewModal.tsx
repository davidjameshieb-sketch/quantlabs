import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, BarChart3, Factory, Target, History, Brain, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TierPreview {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}

interface TierPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  tierName: string;
  tierLevel: number;
  previews: TierPreview[];
}

export const TierPreviewModal = ({ isOpen, onClose, tierName, tierLevel, previews }: TierPreviewModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const next = () => setCurrentIndex((prev) => (prev + 1) % previews.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + previews.length) % previews.length);
  
  const currentPreview = previews[currentIndex];
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-card border-border">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                Tier {tierLevel}
              </Badge>
              <DialogTitle className="font-display text-xl">{tierName} Preview</DialogTitle>
            </div>
          </div>
        </DialogHeader>
        
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Preview Card */}
              <div className={cn(
                "aspect-video rounded-xl flex items-center justify-center relative overflow-hidden",
                currentPreview.gradient
              )}>
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                <div className="relative z-10 text-center p-8">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-background/20 backdrop-blur flex items-center justify-center">
                    {currentPreview.icon}
                  </div>
                  <h3 className="font-display text-2xl font-bold text-white mb-2">
                    {currentPreview.title}
                  </h3>
                  <p className="text-white/80 max-w-md mx-auto">
                    {currentPreview.description}
                  </p>
                </div>
              </div>
              
              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={prev}
                  className="gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                
                <div className="flex gap-2">
                  {previews.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        idx === currentIndex ? "bg-primary w-4" : "bg-muted-foreground/30"
                      )}
                    />
                  ))}
                </div>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={next}
                  className="gap-2"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Tier preview data
export const TIER_PREVIEWS: Record<number, TierPreview[]> = {
  1: [
    {
      title: "Neural Market Summary",
      description: "Single-timeframe analysis with bias, efficiency score, and plain-English explanations",
      icon: <Brain className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-slate-600 to-slate-800",
    },
    {
      title: "Strategy Labels",
      description: "Clear PRESSING, WATCHING, AVOIDING labels so you know the current market condition",
      icon: <Target className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-slate-700 to-slate-900",
    },
  ],
  2: [
    {
      title: "Multi-Timeframe View",
      description: "See how structure aligns across 15m, 1h, and 4h timeframes",
      icon: <Layers className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-blue-600 to-blue-800",
    },
    {
      title: "Confidence & Conviction Metrics",
      description: "Quantified confidence percentages and conviction states for deeper understanding",
      icon: <BarChart3 className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-blue-700 to-indigo-900",
    },
  ],
  3: [
    {
      title: "Sector Strength Dashboards",
      description: "Aggregated QuantLabs scoring across all 11 market sectors",
      icon: <Factory className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-cyan-600 to-cyan-800",
    },
    {
      title: "AI Discovery Engine",
      description: "Natural language filtering across price, volume, and conviction criteria",
      icon: <Brain className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-cyan-700 to-teal-900",
    },
    {
      title: "Cross-Market Scanner",
      description: "Scan stocks, crypto, forex, and commodities in one unified view",
      icon: <Target className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-teal-600 to-emerald-800",
    },
  ],
  4: [
    {
      title: "Industry-Level Analysis",
      description: "Drill down from sectors to specific industries with aggregate scoring",
      icon: <Factory className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-purple-600 to-purple-800",
    },
    {
      title: "Historical Condition Outcomes",
      description: "See what historically happened after each condition was detected",
      icon: <History className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-purple-700 to-violet-900",
    },
    {
      title: "Premium Heikin Ashi Charts",
      description: "Professional charting with Condition Replay overlays",
      icon: <BarChart3 className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-violet-600 to-indigo-800",
    },
  ],
  5: [
    {
      title: "Full Market Intelligence",
      description: "Russell 5000 + all US equities with complete historical context",
      icon: <Brain className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-amber-500 to-orange-700",
    },
    {
      title: "Advanced Backtest Filtering",
      description: "Filter by sample size, win rate, MFE/MAE, and regime stability",
      icon: <Target className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-orange-600 to-red-800",
    },
    {
      title: "Full Transparency View",
      description: "All metrics exposed with complete explainability",
      icon: <Layers className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-red-600 to-rose-800",
    },
    {
      title: "Exportable Summaries",
      description: "Download analysis reports and condition summaries",
      icon: <History className="w-10 h-10 text-white" />,
      gradient: "bg-gradient-to-br from-rose-600 to-pink-800",
    },
  ],
};
