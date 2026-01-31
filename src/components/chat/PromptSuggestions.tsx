import { motion } from 'framer-motion';
import { TrendingUp, Search, AlertTriangle, Zap, BarChart3, Globe, History, Factory, Target, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Suggestion {
  icon: React.ReactNode;
  label: string;
  prompt: string;
  category: 'filter' | 'sector' | 'condition' | 'backtest' | 'industry';
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <Target className="w-4 h-4" />,
    label: "Best 10-day outcomes after High Conviction",
    prompt: "Show top tickers in Russell 5000 with best 10-day outcome after High Conviction.",
    category: 'backtest',
  },
  {
    icon: <Factory className="w-4 h-4" />,
    label: "Strongest industries by conviction",
    prompt: "Which industries are strongest right now by conviction + efficiency?",
    category: 'industry',
  },
  {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Noisy sectors to avoid",
    prompt: "Find noisy sectors to avoid.",
    category: 'condition',
  },
  {
    icon: <Zap className="w-4 h-4" />,
    label: "Compression setups with follow-through",
    prompt: "Show compression setups with strong historical follow-through (sample size > 50).",
    category: 'backtest',
  },
  {
    icon: <TrendingUp className="w-4 h-4" />,
    label: "Active stocks over $10, clean movement",
    prompt: "Most active stocks over $10 with clean movement efficiency.",
    category: 'filter',
  },
  {
    icon: <BarChart3 className="w-4 h-4" />,
    label: "Rank sectors by historical outcomes",
    prompt: "Rank sectors by historical outcomes under High Conviction.",
    category: 'sector',
  },
  {
    icon: <Activity className="w-4 h-4" />,
    label: "Stable regimes with high conviction",
    prompt: "Show stable regimes (low flip rate) with high conviction.",
    category: 'condition',
  },
  {
    icon: <Search className="w-4 h-4" />,
    label: "High liquidity + best outcomes",
    prompt: "Filter to liquidity above average and strongest historical outcomes under current condition.",
    category: 'filter',
  },
  {
    icon: <History className="w-4 h-4" />,
    label: "Compare High Conviction vs Mixed",
    prompt: "Compare outcomes: high conviction vs mixed over last 2 years.",
    category: 'backtest',
  },
  {
    icon: <Globe className="w-4 h-4" />,
    label: "Best/worst industries on compression",
    prompt: "Show best/worst industries when compression appears.",
    category: 'industry',
  },
];

interface PromptSuggestionsProps {
  onSelect: (prompt: string) => void;
}

export const PromptSuggestions = ({ onSelect }: PromptSuggestionsProps) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground text-center uppercase tracking-wider">
        Discovery Ideas
      </p>
      <div className="grid grid-cols-1 gap-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <motion.button
            key={suggestion.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => onSelect(suggestion.prompt)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all",
              "bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-primary/30",
              "group cursor-pointer"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
              suggestion.category === 'filter' && "bg-primary/10 text-primary group-hover:bg-primary/20",
              suggestion.category === 'sector' && "bg-secondary/10 text-secondary group-hover:bg-secondary/20",
              suggestion.category === 'condition' && "bg-neural-orange/10 text-neural-orange group-hover:bg-neural-orange/20",
              suggestion.category === 'backtest' && "bg-neural-green/10 text-neural-green group-hover:bg-neural-green/20",
              suggestion.category === 'industry' && "bg-accent/10 text-accent group-hover:bg-accent/20",
            )}>
              {suggestion.icon}
            </div>
            <span className="text-sm text-foreground/80 group-hover:text-foreground line-clamp-2">
              {suggestion.label}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};
