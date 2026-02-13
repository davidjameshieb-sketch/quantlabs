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
    icon: <Activity className="w-4 h-4" />,
    label: "Open positions health check",
    prompt: "Give me a full health check on all open positions — THS, MFE/MAE, regime alignment, and any concerns.",
    category: 'trades',
  },
  {
    icon: <ShieldCheck className="w-4 h-4" />,
    label: "Is governance working?",
    prompt: "Analyze blocked trade counterfactual data — is governance protecting capital or over-filtering profitable opportunities?",
    category: 'governance',
  },
  {
    icon: <BarChart3 className="w-4 h-4" />,
    label: "Performance by pair and session",
    prompt: "Break down win rate and net pips by currency pair and session. Which combinations are producing edge?",
    category: 'performance',
  },
  {
    icon: <TrendingDown className="w-4 h-4" />,
    label: "Biggest weaknesses right now",
    prompt: "What are the biggest weaknesses in the current trade book? Where is the system losing pips and why?",
    category: 'risk',
  },
  {
    icon: <Brain className="w-4 h-4" />,
    label: "System adaptation progress",
    prompt: "How is the system adapting? Summarize learning phase progress, confidence decay events, and environment signature maturity.",
    category: 'system',
  },
  {
    icon: <Target className="w-4 h-4" />,
    label: "Agent performance rankings",
    prompt: "Rank all agents by net pips and win rate. Which agents should I be watching closely?",
    category: 'performance',
  },
  {
    icon: <Zap className="w-4 h-4" />,
    label: "Execution quality audit",
    prompt: "Audit execution quality — average slippage, spread at entry, fill latency. Is execution friction eating into edge?",
    category: 'risk',
  },
  {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Recent trade failures analysis",
    prompt: "Show me the last 10 losing trades — what went wrong? Common patterns, regime mismatches, or governance gaps?",
    category: 'trades',
  },
  {
    icon: <Search className="w-4 h-4" />,
    label: "Best regime + session combos",
    prompt: "Which regime and session combinations have the highest expectancy? Where should the system be concentrating?",
    category: 'governance',
  },
  {
    icon: <Cpu className="w-4 h-4" />,
    label: "Road to Prime Directive",
    prompt: "Assess progress toward the Prime Directive. What milestones have been hit, what's blocking profitability, and what needs to change next?",
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
