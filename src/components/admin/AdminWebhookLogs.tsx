import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export const AdminWebhookLogs = () => {
  const { data: events, isLoading } = useQuery({
    queryKey: ['admin-webhook-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading webhook logs...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Webhook Events</h2>
        <p className="text-sm text-muted-foreground">
          {events?.length || 0} events logged · Auto-refreshes every 30s
        </p>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-xs">Event Type</TableHead>
              <TableHead className="text-xs">Event ID</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Error</TableHead>
              <TableHead className="text-xs">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events?.map((event) => (
              <TableRow key={event.id} className="border-border/50">
                <TableCell className="text-sm font-medium font-mono">{event.type}</TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {event.stripe_event_id.slice(0, 20)}...
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      event.processed
                        ? 'bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))]'
                        : 'bg-destructive/15 text-destructive'
                    }`}
                  >
                    {event.processed ? 'Success' : 'Failed'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                  {event.error || '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {(!events || events.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                  No webhook events received yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
