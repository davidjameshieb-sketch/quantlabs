import { motion } from 'framer-motion';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage as Message } from '@/hooks/useMarketChat';

interface ChatMessageProps {
  message: Message;
}

// Simple markdown-like formatting
const formatContent = (content: string) => {
  // Split by double newlines for paragraphs
  const paragraphs = content.split(/\n\n+/);
  
  return paragraphs.map((paragraph, pIdx) => {
    // Handle headers
    if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
      const text = paragraph.slice(2, -2);
      return (
        <h4 key={pIdx} className="font-display font-semibold text-foreground mt-4 mb-2 first:mt-0">
          {text}
        </h4>
      );
    }
    
    // Handle lists
    if (paragraph.includes('\n-') || paragraph.startsWith('-')) {
      const lines = paragraph.split('\n');
      return (
        <ul key={pIdx} className="space-y-1 my-2">
          {lines.map((line, lIdx) => {
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
      const lines = paragraph.split('\n');
      return (
        <ol key={pIdx} className="space-y-2 my-2">
          {lines.map((line, lIdx) => {
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
    
    // Regular paragraph with line breaks
    const lines = paragraph.split('\n');
    return (
      <p key={pIdx} className="my-2 first:mt-0 last:mb-0">
        {lines.map((line, lIdx) => (
          <span key={lIdx}>
            {formatInline(line)}
            {lIdx < lines.length - 1 && <br />}
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

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === 'user';

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
            {message.content ? formatContent(message.content) : (
              <span className="text-muted-foreground animate-pulse">Thinking...</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
