import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export const AdminUsers = () => {
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['admin-profiles-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: roles } = useQuery({
    queryKey: ['admin-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const rolesMap = new Map<string, string[]>();
  roles?.forEach((r) => {
    const existing = rolesMap.get(r.user_id) || [];
    existing.push(r.role);
    rolesMap.set(r.user_id, existing);
  });

  const planColor = (plan: string | null) => {
    return plan === 'premium'
      ? 'bg-primary/15 text-primary'
      : 'bg-muted text-muted-foreground';
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading users...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Users</h2>
        <p className="text-sm text-muted-foreground">{profiles?.length || 0} total users</p>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs">Plan</TableHead>
              <TableHead className="text-xs">Signed Up</TableHead>
              <TableHead className="text-xs">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles?.map((profile) => {
              const userRoles = rolesMap.get(profile.user_id) || ['user'];
              return (
                <TableRow key={profile.id} className="border-border/50">
                  <TableCell className="text-sm font-medium">{profile.email || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {userRoles.map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className={`text-xs ${
                            role === 'admin' ? 'bg-[hsl(var(--neural-purple))]/15 text-[hsl(var(--neural-purple))]' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${planColor(profile.plan)}`}>
                      {profile.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {profile.last_active_at
                      ? new Date(profile.last_active_at).toLocaleDateString()
                      : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            {(!profiles || profiles.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                  No users yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
