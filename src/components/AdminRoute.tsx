import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading, isAdmin } = useAuth();
  const [serverVerified, setServerVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) {
      setServerVerified(false);
      return;
    }

    // Server-side verification: call check-subscription which validates admin role server-side
    const verifyAdmin = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-subscription');
        if (error) {
          console.error('[AdminRoute] Server verification failed:', error);
          setServerVerified(false);
          return;
        }
        // Admin users get product_id = 'admin_override' from the server
        setServerVerified(data?.product_id === 'admin_override');
      } catch {
        setServerVerified(false);
      }
    };

    verifyAdmin();
  }, [user, isAdmin]);

  if (loading || (isAdmin && serverVerified === null)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin || !serverVerified) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
