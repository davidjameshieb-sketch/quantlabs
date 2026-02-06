import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CreditCard, TrendingUp, UserPlus, UserMinus, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { STRIPE_CONFIG } from '@/lib/stripe/config';

export const AdminOverview = () => {
  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: stripeCustomers } = useQuery({
    queryKey: ['admin-stripe-customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stripe_customers').select('*');
      if (error) throw error;
      return data;
    },
  });

  const totalUsers = profiles?.length || 0;
  const activeSubscribers = stripeCustomers?.filter(
    (sc) => sc.subscription_status === 'active' || sc.subscription_status === 'trialing'
  ).length || 0;
  const mrr = activeSubscribers * STRIPE_CONFIG.edge.price;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const newSubs7d = stripeCustomers?.filter(
    (sc) =>
      (sc.subscription_status === 'active' || sc.subscription_status === 'trialing') &&
      new Date(sc.updated_at) >= sevenDaysAgo
  ).length || 0;

  const newSubs30d = stripeCustomers?.filter(
    (sc) =>
      (sc.subscription_status === 'active' || sc.subscription_status === 'trialing') &&
      new Date(sc.updated_at) >= thirtyDaysAgo
  ).length || 0;

  const churned30d = stripeCustomers?.filter(
    (sc) =>
      sc.subscription_status === 'canceled' &&
      new Date(sc.updated_at) >= thirtyDaysAgo
  ).length || 0;

  const conversionRate = totalUsers > 0 ? ((activeSubscribers / totalUsers) * 100).toFixed(1) : '0.0';

  const metrics = [
    { label: 'Total Users', value: totalUsers, icon: Users, color: 'text-primary' },
    { label: 'Active Subscribers', value: activeSubscribers, icon: CreditCard, color: 'text-[hsl(var(--neural-green))]' },
    { label: 'MRR', value: `$${mrr.toLocaleString()}`, icon: TrendingUp, color: 'text-[hsl(var(--neural-cyan))]' },
    { label: 'New Subs (7d)', value: newSubs7d, icon: UserPlus, color: 'text-[hsl(var(--neural-purple))]' },
    { label: 'New Subs (30d)', value: newSubs30d, icon: UserPlus, color: 'text-[hsl(var(--neural-orange))]' },
    { label: 'Churn (30d)', value: churned30d, icon: UserMinus, color: 'text-destructive' },
    { label: 'Conversion Rate', value: `${conversionRate}%`, icon: Percent, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Executive Snapshot</h2>
        <p className="text-sm text-muted-foreground">Real-time business metrics</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="border-border/50 bg-card/80">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-normal text-muted-foreground flex items-center gap-1.5">
                <metric.icon className={`w-3.5 h-3.5 ${metric.color}`} />
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-bold font-display ${metric.color}`}>{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
