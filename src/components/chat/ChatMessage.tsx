import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Zap, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ChatMessage as Message } from '@/hooks/useMarketChat';

interface ChatMessageProps {
  message: Message;
  onExecuteAction?: (action: Record<string, unknown>) => Promise<{ success: boolean; detail?: string }>;
}

// Enhanced markdown formatting with tables, headers, and alerts
const formatContent = (content: string) => {
  const paragraphs = content.split(/\n\n+/);
  
  return paragraphs.map((paragraph, pIdx) => {
    // Handle markdown tables
    const lines = paragraph.split('\n');
    if (lines.length >= 2 && lines[0].includes('|') && lines[1]?.match(/^\|[\s-:|]+\|$/)) {
      const headerCells = lines[0].split('|').filter(c => c.trim());
      const bodyRows = lines.slice(2).filter(l => l.includes('|'));
      return (
        <div key={pIdx} className="my-3 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border/60">
                {headerCells.map((cell, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                    {formatInline(cell.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => {
                const cleanCells = row.startsWith('|') ? row.slice(1, row.endsWith('|') ? -1 : undefined).split('|') : row.split('|');
                return (
                  <tr key={rIdx} className="border-b border-border/30 last:border-0 hover:bg-muted/30">
                    {cleanCells.map((cell, i) => (
                      <td key={i} className="px-3 py-1.5 text-foreground/80 whitespace-nowrap">
                        {formatInline(cell.trim())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    // Handle ### headers
    const h3Match = paragraph.match(/^###\s+(.+)/);
    if (h3Match) {
      return (
        <h3 key={pIdx} className="font-display font-bold text-foreground mt-5 mb-2 first:mt-0 text-base">
          {formatInline(h3Match[1])}
        </h3>
      );
    }

    // Handle ## headers
    const h2Match = paragraph.match(/^##\s+(.+)/);
    if (h2Match) {
      return (
        <h2 key={pIdx} className="font-display font-bold text-foreground mt-5 mb-2 first:mt-0 text-lg border-b border-border/40 pb-1">
          {formatInline(h2Match[1])}
        </h2>
      );
    }

    // Handle #### headers
    const h4Match = paragraph.match(/^####\s+(.+)/);
    if (h4Match) {
      return (
        <h4 key={pIdx} className="font-display font-semibold text-foreground mt-4 mb-1 first:mt-0 text-sm">
          {formatInline(h4Match[1])}
        </h4>
      );
    }

    // Handle **Bold Only** paragraphs as headers
    if (paragraph.startsWith('**') && paragraph.endsWith('**') && !paragraph.slice(2, -2).includes('\n')) {
      const text = paragraph.slice(2, -2);
      return (
        <h4 key={pIdx} className="font-display font-semibold text-foreground mt-4 mb-2 first:mt-0">
          {text}
        </h4>
      );
    }

    // Handle alert blocks (⚠️ or 🔴 or ✅ prefixed)
    if (paragraph.match(/^[⚠️🔴✅🟡🟢❌]/u)) {
      return (
        <div key={pIdx} className="my-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          {paragraph.split('\n').map((line, lIdx) => (
            <span key={lIdx}>
              {formatInline(line)}
              {lIdx < paragraph.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
      );
    }
    
    // Handle lists (- items)
    if (paragraph.includes('\n-') || paragraph.startsWith('-')) {
      const listLines = paragraph.split('\n');
      return (
        <ul key={pIdx} className="space-y-1 my-2">
          {listLines.map((line, lIdx) => {
            if (line.startsWith('-')) {
              return (
                <li key={lIdx} className="flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span>{formatInline(line.slice(1).trim())}</span>
                </li>
              );
            }
            return <span key={lIdx}>{formatInline(line)}</span>;
          })}
        </ul>
      );
    }
    
    // Handle numbered lists
    if (/^\d+\./.test(paragraph)) {
      const numLines = paragraph.split('\n');
      return (
        <ol key={pIdx} className="space-y-2 my-2">
          {numLines.map((line, lIdx) => {
            const match = line.match(/^(\d+)\.\s*(.*)/);
            if (match) {
              return (
                <li key={lIdx} className="flex items-start gap-2">
                  <span className="text-primary font-semibold min-w-[1.5rem]">{match[1]}.</span>
                  <span>{formatInline(match[2])}</span>
                </li>
              );
            }
            return <span key={lIdx}>{formatInline(line)}</span>;
          })}
        </ol>
      );
    }
    
    // Regular paragraph
    const pLines = paragraph.split('\n');
    return (
      <p key={pIdx} className="my-2 first:mt-0 last:mb-0">
        {pLines.map((line, lIdx) => (
          <span key={lIdx}>
            {formatInline(line)}
            {lIdx < pLines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
};

// Format inline elements (bold, code, etc.)
const formatInline = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold text
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
      }
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }
    
    // Code inline
    const codeMatch = remaining.match(/`(.+?)`/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, codeMatch.index)}</span>);
      }
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-muted text-primary text-sm font-mono">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
      continue;
    }
    
    // Arrow indicator for explanations
    const arrowMatch = remaining.match(/→\s*(.+)/);
    if (arrowMatch && arrowMatch.index !== undefined) {
      if (arrowMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, arrowMatch.index)}</span>);
      }
      parts.push(
        <span key={key++} className="block mt-1 text-muted-foreground text-sm italic pl-4 border-l-2 border-primary/30">
          {arrowMatch[1]}
        </span>
      );
      remaining = '';
      continue;
    }
    
    // No more patterns, add the rest
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }
  
  return parts.length === 1 ? parts[0] : <>{parts}</>;
};

// Parse action blocks from AI response
function extractActionBlocks(content: string): { text: string; actions: Record<string, unknown>[] } {
  const actions: Record<string, unknown>[] = [];
  const text = content.replace(/```action\n([\s\S]*?)```/g, (_match, json) => {
    try {
      actions.push(JSON.parse(json.trim()));
    } catch { /* ignore malformed */ }
    return '';
  });
  return { text: text.trim(), actions };
}

function ActionButton({ action, onExecute }: { action: Record<string, unknown>; onExecute?: (a: Record<string, unknown>) => Promise<{ success: boolean; detail?: string }> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [detail, setDetail] = useState('');

  const label = action.type === 'close_trade'
    ? `Close Trade ${action.tradeId}`
    : action.type === 'update_sl_tp'
    ? `Update SL/TP on ${action.tradeId}`
    : action.type === 'place_trade'
    ? `${String(action.direction || '').toUpperCase()} ${action.units} ${action.pair}`
    : String(action.type);

  const handleClick = async () => {
    if (!onExecute || state === 'loading') return;
    setState('loading');
    try {
      const result = await onExecute(action);
      setState(result.success ? 'success' : 'error');
      setDetail(result.detail || '');
    } catch (err) {
      setState('error');
      setDetail((err as Error).message);
    }
  };

  return (
    <div className="my-2 flex items-center gap-2">
      <Button
        size="sm"
        variant={state === 'success' ? 'outline' : 'default'}
        disabled={state === 'loading' || state === 'success'}
        onClick={handleClick}
        className="gap-2"
      >
        {state === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
        {state === 'success' && <CheckCircle className="w-3 h-3 text-green-500" />}
        {state === 'error' && <XCircle className="w-3 h-3 text-destructive" />}
        {state === 'idle' && <Zap className="w-3 h-3" />}
        {state === 'success' ? 'Executed' : label}
      </Button>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

export const ChatMessage = ({ message, onExecuteAction }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const { text, actions } = isUser ? { text: message.content, actions: [] } : extractActionBlocks(message.content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
        isUser 
          ? "bg-primary/20 border border-primary/30" 
          : "bg-gradient-to-br from-primary to-secondary"
      )}>
        {isUser ? (
          <User className="w-4 h-4 text-primary" />
        ) : (
          <Bot className="w-4 h-4 text-background" />
        )}
      </div>

      {/* Message bubble */}
      <div className={cn(
        "flex-1 max-w-[85%] rounded-xl px-4 py-3",
        isUser 
          ? "bg-primary/10 border border-primary/20" 
          : "bg-muted/50 border border-border/50"
      )}>
        {isUser ? (
          <p className="text-sm text-foreground">{message.content}</p>
        ) : (
          <div className="text-sm text-foreground/90 prose-sm">
            {text ? formatContent(text) : (
              <span className="text-muted-foreground animate-pulse">Thinking...</span>
            )}
            {actions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs font-semibold text-primary mb-1">⚡ Floor Manager Actions</p>
                {actions.map((action, i) => (
                  <ActionButton key={i} action={action} onExecute={onExecuteAction} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
