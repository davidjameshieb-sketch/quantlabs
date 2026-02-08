import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type LockStep = 'pin' | 'password' | 'unlocked';

interface SiteLockContextType {
  step: LockStep;
  submitPin: (pin: string) => boolean;
  submitPassword: (password: string) => boolean;
}

const SiteLockContext = createContext<SiteLockContextType | undefined>(undefined);

const SITE_PIN = '5225';
const SITE_PASSWORD = 'Atlas2024!';
const STORAGE_KEY = 'ql_site_unlocked';

export const useSiteLock = () => {
  const ctx = useContext(SiteLockContext);
  if (!ctx) throw new Error('useSiteLock must be used within SiteLockProvider');
  return ctx;
};

export const SiteLockProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState<LockStep>(() => {
    return sessionStorage.getItem(STORAGE_KEY) === '1' ? 'unlocked' : 'pin';
  });

  const submitPin = useCallback((pin: string) => {
    if (pin === SITE_PIN) {
      setStep('password');
      return true;
    }
    return false;
  }, []);

  const submitPassword = useCallback((password: string) => {
    if (password === SITE_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      setStep('unlocked');
      return true;
    }
    return false;
  }, []);

  return (
    <SiteLockContext.Provider value={{ step, submitPin, submitPassword }}>
      {children}
    </SiteLockContext.Provider>
  );
};
