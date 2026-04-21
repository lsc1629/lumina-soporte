// Type declarations for Deno runtime used in Supabase Edge Functions
// This file suppresses TypeScript errors in the IDE

declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const env: {
    get(key: string): string | undefined;
  };
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export { createClient, SupabaseClient } from '@supabase/supabase-js';
}
