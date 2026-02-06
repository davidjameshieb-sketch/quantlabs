import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, MessageSquare, Clock, ChevronRight, Ban } from 'lucide-react';
import { AgentDecision } from '@/lib/agents/types';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface DecisionsFeedProps {
  decisions: AgentDecision[];
  agentName: string;
  onSelectDecision?: (decision: AgentDecision) => void;
}

const strategyColors: Record<string, string> = {
  pressing: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  tracking: 'bg-primary/20 text-primary border-primary/30',
  holding: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  watching: 'bg-muted text-muted-foreground border-border/50',
  avoiding: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

export const DecisionsFeed = ({ decisions, agentName, onSelectDecision }: DecisionsFeedProps) => {
  const formatTime = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <CardTitle className="font-display text-lg">Recent Decisions</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">{decisions.length} signals</Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-3 pr-2">
            {decisions.map((d) => (
              <div
                key={`${d.ticker}-${d.timestamp}`}
                className={cn(
                  'p-3 rounded-lg bg-muted/20 border border-border/30 transition-colors',
                  onSelectDecision ? 'hover:bg-muted/40 cursor-pointer group' : 'hover:bg-muted/40'
                )}
                onClick={() => onSelectDecision?.(d)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Link 
                      to={`/dashboard/ticker/${d.ticker}`}
                      className="font-display font-bold text-sm hover:text-primary transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      {d.ticker}
                    </Link>
                    <div className="flex items-center gap-1">
                      {d.bias === 'bullish' 
                        ? <TrendingUp className="w-3.5 h-3.5 text-neural-green" />
                        : <TrendingDown className="w-3.5 h-3.5 text-neural-red" />
                      }
                      <span className={cn(
                        'text-xs font-bold uppercase',
                        d.bias === 'bullish' ? 'text-neural-green' : 'text-neural-red'
                      )}>
                        {d.bias}
                      </span>
                    </div>
                    <Badge variant="outline" className={cn('text-xs', strategyColors[d.strategy])}>
                      {d.strategy === 'avoiding' && <Ban className="w-2.5 h-2.5 mr-1" />}
                      {d.strategy.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatTime(d.timestamp)}
                    </div>
                    {onSelectDecision && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground line-clamp-2">{d.reasoning}</p>
                
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="text-muted-foreground">
                    Confidence: <span className="font-medium text-foreground">{d.confidence.toFixed(0)}%</span>
                  </span>
                  <span className="text-muted-foreground">
                    R:R: <span className="font-medium text-foreground">{d.riskReward.toFixed(1)}</span>
                  </span>
                  <div className="flex gap-1 ml-auto">
                    {d.strategyBlocks.map(b => (
                      <Badge key={b} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {b.split('-').map(w => w[0].toUpperCase()).join('')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
