// Sovereign Voice Console — compact inline command interface for the Command Bridge
import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Send, Loader2, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface LogEntry {
  id: string;
  text: string;
  type: 'command' | 'response' | 'error' | 'system';
  ts: number;
}

export function SovereignVoiceConsole() {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 'boot', text: 'Sovereign Console ready — type directives or queries', type: 'system', ts: Date.now() },
  ]);
  const [sending, setSending] = useState(false);

  const addLog = useCallback((text: string, type: LogEntry['type']) => {
    setLogs(prev => [...prev.slice(-50), { id: crypto.randomUUID(), text, type, ts: Date.now() }]);
  }, []);

  const sendCommand = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || sending) return;
    setInput('');
    addLog(`> ${cmd}`, 'command');
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addLog('Not authenticated — log in first', 'error');
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-ai-desk`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ message: cmd }),
        }
      );

      if (!res.ok) {
        addLog(`Error ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`, 'error');
        return;
      }

      // Stream the response
      const reader = res.body?.getReader();
      if (!reader) {
        addLog('No response stream', 'error');
        return;
      }

      let full = '';
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
      }

      // Extract text content from streamed response
      const textContent = full
        .split('\n')
        .filter(l => l.startsWith('data: '))
        .map(l => {
          try {
            const d = JSON.parse(l.slice(6));
            return d.text || d.content || '';
          } catch { return l.slice(6); }
        })
        .join('');

      addLog(textContent || full.slice(0, 500), 'response');
    } catch (err) {
      addLog(`Error: ${(err as Error).message}`, 'error');
    } finally {
      setSending(false);
    }
  }, [input, sending, addLog]);

  const typeColors: Record<string, string> = {
    command: 'text-cyan-400',
    response: 'text-foreground',
    error: 'text-red-400',
    system: 'text-muted-foreground',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden h-full flex flex-col"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <Terminal className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Sovereign Voice Console</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono ml-auto">L5</Badge>
        {sending && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
      </div>

      <ScrollArea className="flex-1 min-h-0 max-h-[280px]">
        <div className="p-3 space-y-1 font-mono text-[11px]">
          {logs.map(l => (
            <div key={l.id} className={`flex gap-2 ${typeColors[l.type]}`}>
              <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-40" />
              <span className="whitespace-pre-wrap break-all">{l.text}</span>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-border/30 bg-muted/20">
        <form
          onSubmit={e => { e.preventDefault(); sendCommand(); }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Issue directive…"
            className="flex-1 h-8 text-xs font-mono bg-background/50 border-border/30"
            disabled={sending}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={sending || !input.trim()}
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
