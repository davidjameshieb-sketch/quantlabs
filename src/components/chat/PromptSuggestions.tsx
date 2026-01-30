import { motion } from 'framer-motion';
import { TrendingUp, Search, AlertTriangle, Zap, BarChart3, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Suggestion {
  icon: React.ReactNode;
  label: string;
  prompt: string;
  category: 'filter' | 'sector' | 'condition';
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <TrendingUp className="w-4 h-4" />,
    label: "High conviction stocks over $10",
    prompt: "Show me high-conviction stocks over $10 with strong volume and clean efficiency",
    category: 'filter',
  },
  {
    icon: <BarChart3 className="w-4 h-4" />,
    label: "Strongest sectors now",
    prompt: "Which sectors are showing the strongest structure right now?",
    category: 'sector',
  },
  {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Markets to avoid",
    prompt: "Find noisy markets with low efficiency that I should avoid today",
    category: 'condition',
  },
  {
    icon: <Zap className="w-4 h-4" />,
    label: "Clean crypto momentum",
    prompt: "Top crypto assets with clean momentum and high confidence",
    category: 'filter',
  },
  {
    icon: <Search className="w-4 h-4" />,
    label: "Compression zones",
    prompt: "Which stocks are in waiting or compression conditions right now?",
    category: 'condition',
  },
  {
    icon: <Globe className="w-4 h-4" />,
    label: "Forex opportunities",
    prompt: "Show me forex pairs with strong directional conviction and PRESSING strategy state",
    category: 'filter',
  },
];

interface PromptSuggestionsProps {
  onSelect: (prompt: string) => void;
}

export const PromptSuggestions = ({ onSelect }: PromptSuggestionsProps) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground text-center uppercase tracking-wider">
        Try asking
      </p>
      <div className="grid grid-cols-1 gap-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <motion.button
            key={suggestion.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
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
              suggestion.category === 'condition' && "bg-accent/10 text-accent group-hover:bg-accent/20",
            )}>
              {suggestion.icon}
            </div>
            <span className="text-sm text-foreground/80 group-hover:text-foreground">
              {suggestion.label}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};
