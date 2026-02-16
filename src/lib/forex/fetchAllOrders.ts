// Shared paginated fetcher for oanda_orders
// Handles the 1000-row Supabase limit by paginating automatically

import { supabase } from '@/integrations/supabase/client';

export interface FetchAllOrdersOptions {
  userId: string;
  /** Columns to select (default: '*') */
  select?: string;
  /** Filter by status values (default: ['filled','closed']) */
  statuses?: string[];
  /** Require non-null entry_price and exit_price (default: true) */
  requirePrices?: boolean;
  /** Filter by environment (e.g. 'backtest', 'practice') — omit for all */
  environment?: string;
  /** Page size per query (default: 1000) */
  pageSize?: number;
  /** Include baseline-excluded trades (default: false) */
  includeExcluded?: boolean;
}

export async function fetchAllOrders(opts: FetchAllOrdersOptions) {
  const {
    userId,
    select = '*',
    statuses = ['filled', 'closed'],
    requirePrices = true,
    environment,
    pageSize = 1000,
    includeExcluded = false,
  } = opts;

  let allRows: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('oanda_orders')
      .select(select)
      .eq('user_id', userId)
      .in('status', statuses)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (!includeExcluded) {
      query = query.eq('baseline_excluded', false);
    }
    if (requirePrices) {
      query = query.not('entry_price', 'is', null).not('exit_price', 'is', null);
    }
    if (environment) {
      query = query.eq('environment', environment);
    }

    const { data, error } = await query;
    if (error) throw error;

    allRows = allRows.concat(data || []);
    hasMore = (data?.length ?? 0) === pageSize;
    offset += pageSize;
  }

  return allRows;
}
