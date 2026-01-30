import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SignalToggleProps {
  label: string;
  active: boolean;
  description: string;
  colorClass?: string;
  icon?: React.ReactNode;
}

export const SignalToggle = ({
  label,
  active,
  description,
  colorClass = 'bg-primary',
  icon,
}: SignalToggleProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            className={cn(
              'relative flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 cursor-default',
              active
                ? 'bg-card/80 border-primary/50'
                : 'bg-muted/30 border-border/30'
            )}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            {/* Glow effect when active */}
            {active && (
              <motion.div
                className={cn(
                  'absolute inset-0 rounded-lg opacity-20 blur-sm',
                  colorClass
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.2 }}
                transition={{ duration: 0.3 }}
              />
            )}

            {/* Toggle indicator */}
            <div
              className={cn(
                'relative w-10 h-5 rounded-full transition-all duration-300',
                active ? colorClass : 'bg-muted'
              )}
            >
              <motion.div
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full shadow-md',
                  active ? 'bg-white' : 'bg-muted-foreground/50'
                )}
                animate={{
                  left: active ? '22px' : '2px',
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
              
              {/* Pulse animation when active */}
              {active && (
                <motion.div
                  className={cn('absolute inset-0 rounded-full', colorClass)}
                  initial={{ opacity: 0.5, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.5 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatType: 'loop',
                  }}
                />
              )}
            </div>

            {/* Label and icon */}
            <div className="flex items-center gap-2 z-10">
              {icon && (
                <span className={cn(
                  'transition-colors duration-300',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {icon}
                </span>
              )}
              <span
                className={cn(
                  'text-sm font-medium transition-colors duration-300',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>

            {/* Status text */}
            <span
              className={cn(
                'ml-auto text-xs font-bold uppercase tracking-wide',
                active ? 'text-primary' : 'text-muted-foreground/50'
              )}
            >
              {active ? 'ON' : 'OFF'}
            </span>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-popover border-border text-popover-foreground"
        >
          <p className="text-sm">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
