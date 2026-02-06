import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Blocks, HelpCircle, Settings2 } from 'lucide-react';
import { StrategyBlock } from '@/lib/agents/types';
import { cn } from '@/lib/utils';

interface StrategyBlocksPanelProps {
  blocks: StrategyBlock[];
  agentName: string;
  onToggleBlock?: (blockId: string) => void;
  onWeightChange?: (blockId: string, weight: number) => void;
}

const blockIcons: Record<string, string> = {
  'trend-follow': '📊',
  'mean-reversion': '↩️',
  'breakout': '💥',
  'momentum': '🚀',
  'volatility-compression': '🔧',
  'range-trading': '📐',
  'macro-overlay': '🌍',
};

export const StrategyBlocksPanel = ({ 
  blocks, 
  agentName,
  onToggleBlock,
  onWeightChange,
}: StrategyBlocksPanelProps) => {
  const totalWeight = blocks.filter(b => b.active).reduce((s, b) => s + b.weight, 0);
  
  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Blocks className="w-5 h-5 text-primary" />
            <CardTitle className="font-display text-lg">Strategy Blocks</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {blocks.filter(b => b.active).length}/{blocks.length} active
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Modular strategy components for {agentName}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {blocks.map((block, i) => (
          <motion.div
            key={block.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'p-3 rounded-lg border transition-all',
              block.active 
                ? 'bg-muted/30 border-border/50' 
                : 'bg-muted/10 border-border/20 opacity-60'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg shrink-0">{blockIcons[block.type] || '⚙️'}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">{block.name}</h4>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">{block.description}</p>
                        <div className="mt-2 space-y-1">
                          {Object.entries(block.parameters).map(([key, val]) => (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="font-mono">{val}</span>
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{block.description.slice(0, 60)}...</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className="text-xs font-mono">
                  {(block.weight * 100).toFixed(0)}%
                </Badge>
                <Switch 
                  checked={block.active}
                  onCheckedChange={() => onToggleBlock?.(block.id)}
                  className="scale-75"
                />
              </div>
            </div>
            
            {/* Weight slider */}
            {block.active && (
              <div className="mt-2 pl-8">
                <Slider
                  value={[block.weight * 100]}
                  max={50}
                  min={5}
                  step={5}
                  className="w-full"
                  onValueChange={([v]) => onWeightChange?.(block.id, v / 100)}
                />
              </div>
            )}
          </motion.div>
        ))}
        
        {/* Total weight indicator */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs">
          <span className="text-muted-foreground">Total Active Weight</span>
          <span className={cn(
            'font-bold',
            Math.abs(totalWeight - 1) < 0.05 ? 'text-neural-green' : 'text-neural-orange'
          )}>
            {(totalWeight * 100).toFixed(0)}%
            {Math.abs(totalWeight - 1) > 0.05 && ' (not balanced)'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
