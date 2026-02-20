// Triple-Lock gate status pill
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GateProps {
  label: string;
  passed: boolean;
  detail?: string;
}

export const GateIndicator = ({ label, passed, detail }: GateProps) => (
  <div
    className={cn(
      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono',
      passed
        ? 'bg-neural-green/10 border-neural-green/30 text-neural-green'
        : 'bg-muted/10 border-border/30 text-muted-foreground'
    )}
  >
    {passed ? (
      <CheckCircle2 className="w-3 h-3 shrink-0" />
    ) : (
      <XCircle className="w-3 h-3 shrink-0 opacity-40" />
    )}
    <span className="font-bold">{label}</span>
    {detail && <span className="opacity-60 truncate">{detail}</span>}
  </div>
);
