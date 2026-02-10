import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading, signInWithGoogle } = useAuth();
  const triggered = useRef(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    // Auto-trigger Google sign-in if not authenticated after loading completes
    if (!loading && !user && !triggered.current) {
      triggered.current = true;
      console.log('[ProtectedRoute] No session — auto-triggering Google sign-in');
      signInWithGoogle();
    }
  }, [loading, user, signInWithGoogle]);

  // If stuck for 8s after loading completes, show retry
  useEffect(() => {
    if (loading || user) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), 8000);
    return () => clearTimeout(timer);
  }, [loading, user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">
            {stalled ? 'Sign-in didn\'t complete.' : 'Authenticating...'}
          </p>
          {stalled && (
            <button
              onClick={() => {
                triggered.current = false;
                setStalled(false);
                signInWithGoogle();
              }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Retry Sign In
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
