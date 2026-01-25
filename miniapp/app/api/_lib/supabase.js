import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_KEY missing");
    }
    client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return client;
}
