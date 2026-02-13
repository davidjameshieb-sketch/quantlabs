import { useState, useCallback, useEffect } from 'react';
import { registerBypass, revokeBypass, type GateBypass } from '@/lib/forex/gateBypassRegistry';
import type { GateId } from '@/lib/forex/tradeGovernanceEngine';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-ai-desk`;

function extractActions(content: string): Record<string, unknown>[] {
  const actions: Record<string, unknown>[] = [];
  content.replace(/```action\n([\s\S]*?)```/g, (_match, json) => {
    try { actions.push(JSON.parse(json.trim())); } catch { /* ignore */ }
    return '';
  });
  return actions;
}

export const useMarketChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem('floor-manager-chat');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist last 5 messages to localStorage
  useEffect(() => {
    try {
      const last5 = messages.filter(m => m.content).slice(-5);
      localStorage.setItem('floor-manager-chat', JSON.stringify(last5));
    } catch { /* ignore */ }
  }, [messages]);

  const sendMessage = useCallback(async (input: string, marketContext?: Record<string, unknown>) => {
    if (!input.trim() || isLoading) return;

    setError(null);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    let assistantContent = '';

    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamDone = false;

      // Add initial assistant message
      const assistantId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (updated[lastIndex]?.role === 'assistant') {
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: assistantContent,
                  };
                }
                return updated;
              });
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Final flush
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
            }
          } catch { /* ignore */ }
        }

        setMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: assistantContent,
            };
          }
          return updated;
        });
      }

      // ─── Auto-execute any action blocks emitted by the Floor Manager ───
      const actionBlocks = extractActions(assistantContent);
      if (actionBlocks.length > 0) {
        console.log(`[FLOOR-MANAGER] Auto-executing ${actionBlocks.length} action(s)`);
        for (const action of actionBlocks) {
          try {
            let result: { success: boolean; detail?: string };

            // ── All actions route to edge function (server-side persistence) ──
            if (action.type === 'bypass_gate' && action.gateId) {
              // Route to server AND register locally for client-side governance
              result = await executeAction(action);
              const gateId = action.gateId as GateId;
              const reason = (action.reason as string) || 'Floor Manager override';
              const ttlMinutes = typeof action.ttlMinutes === 'number' ? action.ttlMinutes : 15;
              const pair = action.pair as string | undefined;
              registerBypass(gateId, reason, ttlMinutes * 60 * 1000, pair);

            } else if (action.type === 'revoke_bypass' && action.gateId) {
              result = await executeAction(action);
              revokeBypass(action.gateId as GateId, action.pair as string | undefined);

            } else {
              result = await executeAction(action);
            }

            const statusLine = result.success
              ? `\n\n✅ **Auto-executed**: ${result.detail}`
              : `\n\n❌ **Execution failed**: ${result.detail}`;
            assistantContent += statusLine;
            setMessages(prev => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (updated[lastIndex]?.role === 'assistant') {
                updated[lastIndex] = { ...updated[lastIndex], content: assistantContent };
              }
              return updated;
            });
          } catch (err) {
            console.error('[FLOOR-MANAGER] Auto-execute error:', err);
          }
        }
      }

    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessages(prev => {
        const filtered = prev.filter(m => m.content !== '' || m.role !== 'assistant');
        return filtered;
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const executeAction = useCallback(async (action: Record<string, unknown>): Promise<{ success: boolean; detail?: string }> => {
    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode: 'action', action, environment: 'live' }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, detail: data.error || `Failed: ${response.status}` };
      }
      const detail = data.results?.[0]?.detail || 'Action executed';
      return { success: true, detail };
    } catch (err) {
      return { success: false, detail: (err as Error).message };
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    try { localStorage.removeItem('floor-manager-chat'); } catch { /* ignore */ }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    executeAction,
  };
};
