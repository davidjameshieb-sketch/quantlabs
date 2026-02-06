import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export const AdminSubscribers = () => {
  const { data: stripeCustomers, isLoading } = useQuery({
    queryKey: ['admin-stripe-customers-detail'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stripe_customers').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

  const statusColor = (status: string | null) => {
    switch (status) {
      case 'active': return 'bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))]';
      case 'trialing': return 'bg-[hsl(var(--neural-cyan))]/15 text-[hsl(var(--neural-cyan))]';
      case 'past_due': return 'bg-[hsl(var(--neural-orange))]/15 text-[hsl(var(--neural-orange))]';
      case 'canceled': return 'bg-destructive/15 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading subscribers...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Subscribers</h2>
        <p className="text-sm text-muted-foreground">{stripeCustomers?.length || 0} total records</p>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Stripe ID</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Payment</TableHead>
              <TableHead className="text-xs">Period End</TableHead>
              <TableHead className="text-xs">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stripeCustomers?.map((sc) => {
              const profile = profileMap.get(sc.user_id);
              return (
                <TableRow key={sc.id} className="border-border/50">
                  <TableCell className="text-sm font-medium">{profile?.email || sc.user_id}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {sc.stripe_customer_id ? `${sc.stripe_customer_id.slice(0, 16)}...` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${statusColor(sc.subscription_status)}`}>
                      {sc.subscription_status || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {sc.last_payment_status || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {sc.current_period_end
                      ? new Date(sc.current_period_end).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(sc.updated_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              );
            })}
            {(!stripeCustomers || stripeCustomers.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                  No subscribers yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
