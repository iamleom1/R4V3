import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Server is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    const anonKey = req.headers.get("apikey");
    if (!authHeader || !anonKey) {
      return json({ error: "Unauthorized." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) {
      return json({ error: "Email is required." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let page = 1;
    const perPage = 200;
    let exists = false;

    while (!exists) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return json({ error: "Failed to verify account." }, 500);
      }

      const users = data?.users ?? [];
      exists = users.some((u) => (u.email ?? "").toLowerCase() === email);
      if (exists || users.length < perPage) {
        break;
      }
      page += 1;
    }

    return json({ exists }, 200);
  } catch {
    return json({ error: "Unexpected server error." }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
