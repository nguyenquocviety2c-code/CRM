import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "Supabase environment variables are missing. Running in offline mode: API routes will return empty data. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to enable the live backend."
  );
}

/**
 * Mock Supabase client used when credentials are missing.
 *
 * Returns empty success results for every query so that API GET routes
 * respond with `{ ok: true, data: [] }` instead of 500 errors. This lets the
 * UI render clean empty states rather than hanging on a loading spinner.
 *
 * The mock supports the chained builder API (.from().select().eq()...),
 * `.single()`, `.maybeSingle()`, `.rpc()`, and is awaitable (thenable).
 */
function createMockSupabaseClient(): SupabaseClient {
  const EMPTY_LIST = { data: [], error: null, count: 0 };
  const EMPTY_SINGLE = { data: null, error: null };

  const createChain = (isSingle: boolean): any => {
    const result = isSingle ? EMPTY_SINGLE : EMPTY_LIST;
    const target: any = {};
    return new Proxy(target, {
      get(_t, prop) {
        switch (prop) {
          case "then":
            return (resolve: any) => Promise.resolve(result).then(resolve);
          case "catch":
            return (reject: any) => Promise.resolve(result).catch(reject);
          case "finally":
            return (cb: any) => Promise.resolve(result).finally(cb);
          case "single":
            return () => createChain(true);
          case "maybeSingle":
            return () => createChain(true);
          default:
            // Any builder method returns the chain so calls keep chaining.
            return () => createChain(isSingle);
        }
      },
    });
  };

  const client: any = {
    from: () => createChain(false),
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };

  return client as SupabaseClient;
}

// Client-side Supabase client (uses anon key, respects RLS)
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })
  : createMockSupabaseClient();

// Server-side admin client (uses service role key, bypasses RLS)
// Use this ONLY in API routes / server components, never in client code
export const supabaseAdmin: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : createMockSupabaseClient();
