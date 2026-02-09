import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading, signInWithGoogle } = useAuth();
  const triggered = useRef(false);

  useEffect(() => {
    // Auto-trigger Google sign-in if not authenticated after loading completes
    if (!loading && !user && !triggered.current) {
      triggered.current = true;
      console.log('[ProtectedRoute] No session — auto-triggering Google sign-in');
      signInWithGoogle();
    }
  }, [loading, user, signInWithGoogle]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
