import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Square, Trash2, Volume2, Brain, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ChatMessage } from './ChatMessage';
import { useVoiceChat, VoiceState } from '@/hooks/useVoiceChat';
import { cn } from '@/lib/utils';

interface VoiceChatInterfaceProps {
  className?: string;
}

const stateLabels: Record<VoiceState, string> = {
  idle: 'Ready — tap mic to talk',
  listening: 'Listening...',
  processing: 'Analyzing system...',
  speaking: 'Speaking...',
};

const stateColors: Record<VoiceState, string> = {
  idle: 'from-muted to-muted',
  listening: 'from-destructive to-destructive/80',
  processing: 'from-primary to-secondary',
  speaking: 'from-accent to-primary',
};

export const VoiceChatInterface = ({ className }: VoiceChatInterfaceProps) => {
  const {
    state,
    messages,
    currentTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    cancel,
    clearMessages,
    sendToAI,
    executeAction,
  } = useVoiceChat();

  const [textInput, setTextInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentTranscript]);

  const handleMicToggle = () => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'speaking' || state === 'processing') {
      cancel();
    } else {
      startListening();
    }
  };

  const handleTextSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim() || state === 'processing') return;
    const msg = textInput;
    setTextInput('');
    sendToAI(msg);
  };

  return (
    <div className={cn("flex flex-col h-full bg-card/50 border border-border/50 rounded-xl overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Brain className="w-4 h-4 text-background" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">Voice Trading Desk</h3>
            <p className="text-xs text-muted-foreground">Talk to your system</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearMessages} className="text-muted-foreground hover:text-foreground">
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <AnimatePresence mode="popLayout">
          {messages.length === 0 && state === 'idle' ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12 space-y-4"
            >
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 flex items-center justify-center">
                <Mic className="w-10 h-10 text-primary" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">Voice Trading Desk</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Tap the mic and speak naturally. Ask about failure patterns, governance gaps, agent performance, or the Prime Directive score.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Find failure patterns', 'Prime Directive score', 'Agent rankings'].map(q => (
                  <button
                    key={q}
                    onClick={() => sendToAI(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} onExecuteAction={executeAction} />
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Live transcript */}
        {currentTranscript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-foreground/80 italic"
          >
            🎙️ {currentTranscript}
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm"
          >
            {error}
          </motion.div>
        )}
      </ScrollArea>

      {/* Voice Control Area */}
      <div className="p-4 border-t border-border/50 bg-muted/20 space-y-3">
        {/* Status */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {state === 'listening' && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />}
          {state === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
          {state === 'speaking' && <Volume2 className="w-3 h-3 text-primary animate-pulse" />}
          <span>{stateLabels[state]}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Text fallback input */}
          <form onSubmit={handleTextSubmit} className="flex-1 flex gap-2">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Or type here..."
              className="text-sm bg-background/50 border-border/50"
              disabled={state === 'processing'}
            />
            <Button type="submit" size="icon" variant="ghost" disabled={!textInput.trim() || state === 'processing'} className="shrink-0 h-9 w-9">
              <Send className="w-4 h-4" />
            </Button>
          </form>

          {/* Mic button */}
          {isSupported ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMicToggle}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-all",
                "bg-gradient-to-br",
                stateColors[state],
                state === 'idle' ? 'text-muted-foreground hover:text-foreground' : 'text-primary-foreground'
              )}
            >
              {state === 'listening' ? (
                <MicOff className="w-5 h-5" />
              ) : state === 'processing' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : state === 'speaking' ? (
                <Square className="w-4 h-4" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </motion.button>
          ) : (
            <div className="text-xs text-destructive">Voice not supported</div>
          )}
        </div>
      </div>
    </div>
  );
};
