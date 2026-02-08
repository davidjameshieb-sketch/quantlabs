import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Lock, ShieldCheck, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { useSiteLock } from '@/contexts/SiteLockContext';

/* ── PIN Entry Screen ── */
const PinScreen = () => {
  const { submitPin } = useSiteLock();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const trySubmit = async (pin: string) => {
    setLoading(true);
    setError('');
    const result = await submitPin(pin);
    setLoading(false);

    if (!result.valid) {
      setError(result.error || 'Incorrect PIN. Try again.');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setDigits(['', '', '', '']);
        inputRefs.current[0]?.focus();
      }, 600);
    }
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value) || loading) return;
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
    setError('');

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== '')) {
      setTimeout(() => trySubmit(next.join('')), 150);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      setDigits(pasted.split(''));
      trySubmit(pasted);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center gap-8"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Lock className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Access Required</h2>
          <p className="text-sm text-muted-foreground">Enter your 4-digit PIN</p>
        </div>
      </div>

      <motion.div
        animate={shake ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.5 }}
        className="flex gap-3"
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit ? '•' : ''}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            disabled={loading}
            className={`w-14 h-16 text-center text-2xl font-mono font-bold rounded-lg border-2 bg-background/50 backdrop-blur-sm outline-none transition-all focus:ring-2 focus:ring-primary/50 ${
              error
                ? 'border-destructive text-destructive'
                : digit
                ? 'border-primary/60 text-foreground'
                : 'border-border/50 text-foreground'
            } ${loading ? 'opacity-50' : ''}`}
          />
        ))}
      </motion.div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Verifying...</span>
        </div>
      )}

      <AnimatePresence>
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-destructive text-sm"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/* ── Password Entry Screen ── */
const PasswordScreen = () => {
  const { submitPassword } = useSiteLock();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError('');
    const result = await submitPassword(password);
    setLoading(false);

    if (!result.valid) {
      setError(result.error || 'Incorrect password. Try again.');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPassword('');
        inputRef.current?.focus();
      }, 600);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center gap-8 w-full max-w-sm"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Secondary Verification</h2>
          <p className="text-sm text-muted-foreground">Enter your access password</p>
        </div>
      </div>

      <motion.form
        onSubmit={handleSubmit}
        animate={shake ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.5 }}
        className="w-full space-y-4"
      >
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder="Enter password"
            disabled={loading}
            autoComplete="off"
            className={`w-full pl-10 pr-4 py-3 rounded-lg border-2 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-2 focus:ring-primary/50 ${
              error ? 'border-destructive' : 'border-border/50 focus:border-primary/60'
            } ${loading ? 'opacity-50' : ''}`}
          />
        </div>

        <AnimatePresence>
          {error && !loading && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-destructive text-sm"
            >
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={!password || loading}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              Verify Access
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </motion.form>
    </motion.div>
  );
};

/* ── Gate Wrapper ── */
export const SiteLockGate = ({ children }: { children: React.ReactNode }) => {
  const { step } = useSiteLock();

  if (step === 'unlocked') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 mb-12"
      >
        <Activity className="w-8 h-8 text-primary" />
        <span className="font-display font-bold text-xl text-foreground">QuantLabs</span>
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 'pin' && <PinScreen key="pin" />}
        {step === 'password' && <PasswordScreen key="password" />}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-2 mt-12"
      >
        <div className={`w-2 h-2 rounded-full transition-colors ${step === 'pin' ? 'bg-primary' : 'bg-primary/30'}`} />
        <div className={`w-2 h-2 rounded-full transition-colors ${step === 'password' ? 'bg-primary' : 'bg-primary/30'}`} />
      </motion.div>

      <p className="mt-8 text-xs text-muted-foreground/50 flex items-center gap-1">
        <ShieldCheck className="w-3 h-3" />
        Server-verified • HMAC-SHA256 • Rate limited
      </p>
    </div>
  );
};
