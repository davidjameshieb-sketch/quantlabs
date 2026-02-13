import { motion } from 'framer-motion';
import { Activity, ShieldCheck, Brain, Target, TrendingDown, Zap, BarChart3, AlertTriangle, Search, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Suggestion {
  icon: React.ReactNode;
  label: string;
  prompt: string;
  category: 'trades' | 'governance' | 'performance' | 'system' | 'risk';
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "🔴 Find all failure patterns NOW",
    prompt: "Run a full forensic scan: Check for regime mismatches (breakdown trap), agent over-correlation, session toxicity, governance over-filtering, profit capture decay, and drawdown clustering. Give me every failure pattern you can find with specific numbers and fixes.",
    category: 'risk',
  },
  {
    icon: <Activity className="w-4 h-4" />,
    label: "Open positions health check",
    prompt: "Give me a full health check on all open positions — THS, MFE/MAE, regime alignment, and any concerns. Flag any trade with THS below 45 and tell me if I should be worried.",
    category: 'trades',
  },
  {
    icon: <ShieldCheck className="w-4 h-4" />,
    label: "Is governance helping or hurting?",
    prompt: "Compare blocked trade counterfactual win rates vs executed trade win rates. Is governance protecting capital or over-filtering profitable opportunities? Give me the numbers and a verdict.",
    category: 'governance',
  },
  {
    icon: <BarChart3 className="w-4 h-4" />,
    label: "What's actually working?",
    prompt: "Show me the top 5 most profitable regime+session+pair combinations. Where is edge actually being captured? What should the system do more of?",
    category: 'performance',
  },
  {
    icon: <TrendingDown className="w-4 h-4" />,
    label: "Where am I bleeding pips?",
    prompt: "Identify every area where the system is losing pips systematically — by pair, regime, session, and agent. Rank them by total pips lost and give specific governance fixes for each.",
    category: 'risk',
  },
  {
    icon: <Brain className="w-4 h-4" />,
    label: "System adaptation audit",
    prompt: "How is the system adapting? Are win rates improving over rolling windows? Which environment signatures are maturing vs degrading? Is the system converging toward the Prime Directive or drifting?",
    category: 'system',
  },
  {
    icon: <Target className="w-4 h-4" />,
    label: "Agent accountability report",
    prompt: "Rank all agents by net pips, win rate, and profit factor. Which agents are actively destroying value? Which should be promoted or suspended? Check for agent correlation — are any agents just duplicating each other's trades?",
    category: 'performance',
  },
  {
    icon: <Zap className="w-4 h-4" />,
    label: "Execution quality deep dive",
    prompt: "Audit execution quality — average slippage, spread at entry, fill latency by pair and session. Is execution friction eating more than 15% of edge? Calculate the friction tax on each pair.",
    category: 'risk',
  },
  {
    icon: <Search className="w-4 h-4" />,
    label: "Optimal regime+session map",
    prompt: "Build me a regime × session heat map showing win rate and expectancy. Which combinations should be auto-approved and which should be hard-blocked? Give specific threshold recommendations.",
    category: 'governance',
  },
  {
    icon: <Cpu className="w-4 h-4" />,
    label: "Prime Directive scorecard",
    prompt: "Assess progress toward the Prime Directive (autonomous live profitability). Score each dimension: Win Rate (target 72%+), Profit Factor (target 1.5+), Max Drawdown (target <3%), Agent Uptime (target 100%), Governance Precision (target <10% over-filter). What's the #1 thing blocking us?",
    category: 'system',
  },
];

interface PromptSuggestionsProps {
  onSelect: (prompt: string) => void;
}

export const PromptSuggestions = ({ onSelect }: PromptSuggestionsProps) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground text-center uppercase tracking-wider">
        Trading Desk Queries
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
              suggestion.category === 'trades' && "bg-primary/10 text-primary group-hover:bg-primary/20",
              suggestion.category === 'governance' && "bg-secondary/10 text-secondary group-hover:bg-secondary/20",
              suggestion.category === 'risk' && "bg-neural-orange/10 text-neural-orange group-hover:bg-neural-orange/20",
              suggestion.category === 'performance' && "bg-neural-green/10 text-neural-green group-hover:bg-neural-green/20",
              suggestion.category === 'system' && "bg-accent/10 text-accent group-hover:bg-accent/20",
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
