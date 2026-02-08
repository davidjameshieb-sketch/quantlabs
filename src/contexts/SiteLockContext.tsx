import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

type LockStep = 'pin' | 'password' | 'unlocked';

interface SiteLockContextType {
  step: LockStep;
  submitPin: (pin: string) => Promise<{ valid: boolean; error?: string }>;
  submitPassword: (password: string) => Promise<{ valid: boolean; error?: string; expired?: boolean }>;
}

const SiteLockContext = createContext<SiteLockContextType | undefined>(undefined);

const STORAGE_KEY = 'ql_site_unlocked';
const PIN_TOKEN_KEY = 'ql_pin_token';

export const useSiteLock = () => {
  const ctx = useContext(SiteLockContext);
  if (!ctx) throw new Error('useSiteLock must be used within SiteLockProvider');
  return ctx;
};

export const SiteLockProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState<LockStep>(() => {
    return sessionStorage.getItem(STORAGE_KEY) === '1' ? 'unlocked' : 'pin';
  });

  const submitPin = useCallback(async (pin: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('site-lock', {
        body: { step: 'pin', value: pin },
      });

      if (error) {
        console.error('[SiteLock] PIN validation error:', error.message);
        return { valid: false, error: 'Server error. Try again.' };
      }

      if (data?.valid && data?.pinToken) {
        // Store the signed PIN token for step 2
        sessionStorage.setItem(PIN_TOKEN_KEY, data.pinToken);
        setStep('password');
        return { valid: true };
      }

      return { valid: false };
    } catch {
      return { valid: false, error: 'Connection error. Try again.' };
    }
  }, []);

  const submitPassword = useCallback(async (password: string): Promise<{ valid: boolean; error?: string; expired?: boolean }> => {
    try {
      const pinToken = sessionStorage.getItem(PIN_TOKEN_KEY);
      if (!pinToken) {
        setStep('pin');
        return { valid: false, error: 'PIN verification expired. Start over.' };
      }

      const { data, error } = await supabase.functions.invoke('site-lock', {
        body: { step: 'password', value: password, pinToken },
      });

      if (error) {
        console.error('[SiteLock] Password validation error:', error.message);
        return { valid: false, error: 'Server error. Try again.' };
      }

      if (data?.expired) {
        sessionStorage.removeItem(PIN_TOKEN_KEY);
        setStep('pin');
        return { valid: false, expired: true, error: 'PIN token expired. Start over.' };
      }

      if (data?.valid && data?.sessionToken) {
        sessionStorage.setItem(STORAGE_KEY, '1');
        sessionStorage.removeItem(PIN_TOKEN_KEY);
        setStep('unlocked');
        return { valid: true };
      }

      return { valid: false };
    } catch {
      return { valid: false, error: 'Connection error. Try again.' };
    }
  }, []);

  return (
    <SiteLockContext.Provider value={{ step, submitPin, submitPassword }}>
      {children}
    </SiteLockContext.Provider>
  );
};
