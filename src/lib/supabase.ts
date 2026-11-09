import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Single Supabase client. Sessions are persisted by supabase-js (localStorage)
 * and refreshed automatically; PKCE is used for OAuth and e-mail links.
 */
export const supabase: SupabaseClient = createClient(
  env.supabaseUrl || 'http://localhost.invalid',
  env.supabaseKey || 'not-configured',
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'jubilate.auth',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);
