// Currency strength bar — shows the 8-currency matrix scores
import { cn } from '@/lib/utils';

const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];

interface Props {
  scores: Record<string, number>;
}

export const CurrencyScoreBar = ({ scores }: Props) => {
  return (
    <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
      {CURRENCIES.map((cur) => {
        const score = scores[cur] ?? 0;
        const isPositive = score > 0;
        const isNegative = score < 0;
        return (
          <div
            key={cur}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/10 border border-border/30"
          >
            <span className="text-[10px] font-mono font-bold text-muted-foreground">{cur}</span>
            <span
              className={cn(
                'text-sm font-display font-bold',
                isPositive && 'text-[hsl(var(--neural-green))]',
                isNegative && 'text-[hsl(var(--neural-red))]',
                !isPositive && !isNegative && 'text-muted-foreground'
              )}
            >
              {score > 0 ? '+' : ''}{score}
            </span>
            <div className="w-full h-1 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isPositive ? 'bg-[hsl(var(--neural-green))]' : isNegative ? 'bg-[hsl(var(--neural-red))]' : 'bg-muted'
                )}
                style={{ width: `${Math.min(100, Math.abs(score) * 33)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
