// PanelCheatSheet — Hover overlay that shows a dynamic summary "cheat sheet" for any panel
import { useState, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheatSheetLine {
  label: string;
  value: string;
  status?: 'good' | 'warn' | 'bad' | 'neutral';
}

interface PanelCheatSheetProps {
  title: string;
  lines: CheatSheetLine[];
  children: ReactNode;
  className?: string;
}

const statusColor: Record<string, string> = {
  good: 'text-neural-green',
  warn: 'text-neural-orange',
  bad: 'text-neural-red',
  neutral: 'text-foreground',
};

export const PanelCheatSheet = ({ title, lines, children, className }: PanelCheatSheetProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cn('relative group', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}

      {/* Hover indicator */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-60 transition-opacity z-10 pointer-events-none">
        <Info className="w-3.5 h-3.5 text-primary" />
      </div>

      {/* Cheat sheet overlay */}
      {hovered && lines.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none animate-in fade-in-0 zoom-in-[0.98] duration-150">
          <div className="m-1 p-3 rounded-xl bg-background/95 backdrop-blur-md border border-primary/30 shadow-xl shadow-primary/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">{title} — Cheat Sheet</span>
            </div>
            <div className="space-y-1">
              {lines.map((line, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground truncate">{line.label}</span>
                  <span className={cn('text-[10px] font-mono font-semibold whitespace-nowrap', statusColor[line.status ?? 'neutral'])}>
                    {line.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
