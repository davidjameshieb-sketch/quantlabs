import { useState, useCallback, useRef, useEffect } from 'react';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-ai-desk`;

export interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const useVoiceChat = () => {
  const [state, setState] = useState<VoiceState>('idle');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Check browser support
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    synthRef.current = null;
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      // Clean markdown for speech
      const clean = text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/#{1,4}\s/g, '')
        .replace(/\|[^|]+\|/g, '')
        .replace(/[-─═]+/g, '')
        .replace(/[⚠️🔴✅🟡🟢❌]/g, '')
        .replace(/→/g, ', ')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ', ')
        .trim();

      if (!clean) { resolve(); return; }

      setState('speaking');
      const utterance = new SpeechSynthesisUtterance(clean);
      synthRef.current = utterance;
      
      // Pick a good voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => 
        v.name.includes('Google') && v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;
      
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      utterance.onend = () => { setState('idle'); resolve(); };
      utterance.onerror = () => { setState('idle'); resolve(); };
      
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const sendToAI = useCallback(async (input: string) => {
    if (!input.trim()) return;

    setError(null);
    const userMsg: VoiceMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setState('processing');

    try {
      abortRef.current = new AbortController();
      
      const allMessages = [...messages, userMsg];
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          mode: 'voice',
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error: ${response.status}`);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      const assistantId = crypto.randomUUID();

      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);

      let streamDone = false;
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
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: assistantContent };
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

      // Flush remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw || raw.startsWith(':') || raw.trim() === '') continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) assistantContent += content;
          } catch { /* ignore */ }
        }
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: assistantContent };
          }
          return updated;
        });
      }

      // Speak the response
      if (assistantContent) {
        await speak(assistantContent);
      } else {
        setState('idle');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Voice chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get response');
      setState('idle');
    }
  }, [messages, speak]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser. Try Chrome.');
      return;
    }

    stopSpeaking();
    setError(null);
    setCurrentTranscript('');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setCurrentTranscript(finalTranscript + interim);
    };

    recognition.onend = () => {
      setState('idle');
      const transcript = finalTranscript.trim();
      if (transcript) {
        setCurrentTranscript('');
        sendToAI(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
      setState('idle');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState('listening');
  }, [isSupported, stopSpeaking, sendToAI]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    stopListening();
    stopSpeaking();
    abortRef.current?.abort();
    setState('idle');
  }, [stopListening, stopSpeaking]);

  const clearMessages = useCallback(() => {
    cancel();
    setMessages([]);
    setError(null);
  }, [cancel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      abortRef.current?.abort();
    };
  }, []);

  return {
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
  };
};
