import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, AlertTriangle, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { STRIPE_CONFIG } from '@/lib/stripe/config';

export const AdminRevenue = () => {
  const { data: stripeCustomers } = useQuery({
    queryKey: ['admin-stripe-customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stripe_customers').select('*');
      if (error) throw error;
      return data;
    },
  });

  const activeCount = stripeCustomers?.filter(
    (sc) => sc.subscription_status === 'active' || sc.subscription_status === 'trialing'
  ).length || 0;

  const trialingCount = stripeCustomers?.filter(
    (sc) => sc.subscription_status === 'trialing'
  ).length || 0;

  const canceledCount = stripeCustomers?.filter(
    (sc) => sc.subscription_status === 'canceled'
  ).length || 0;

  const failedPayments = stripeCustomers?.filter(
    (sc) => sc.last_payment_status === 'failed'
  ).length || 0;

  const pastDueCount = stripeCustomers?.filter(
    (sc) => sc.subscription_status === 'past_due'
  ).length || 0;

  const mrr = activeCount * STRIPE_CONFIG.edge.price;
  const arr = mrr * 12;

  const metrics = [
    { label: 'Monthly Recurring Revenue', value: `$${mrr.toLocaleString()}`, icon: DollarSign, color: 'text-[hsl(var(--neural-green))]' },
    { label: 'Annual Run Rate', value: `$${arr.toLocaleString()}`, icon: TrendingUp, color: 'text-[hsl(var(--neural-cyan))]' },
    { label: 'Active Subscriptions', value: activeCount, icon: TrendingUp, color: 'text-primary' },
    { label: 'Trialing', value: trialingCount, icon: RotateCcw, color: 'text-[hsl(var(--neural-purple))]' },
    { label: 'Canceled', value: canceledCount, icon: RotateCcw, color: 'text-muted-foreground' },
    { label: 'Past Due', value: pastDueCount, icon: AlertTriangle, color: 'text-[hsl(var(--neural-orange))]' },
    { label: 'Failed Payments', value: failedPayments, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Revenue & Billing</h2>
        <p className="text-sm text-muted-foreground">Subscription revenue overview</p>
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

      <Card className="border-border/50 bg-card/80">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            For detailed revenue reports, invoices, and payment analytics, visit your{' '}
            <a
              href="https://dashboard.stripe.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Stripe Dashboard
            </a>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
