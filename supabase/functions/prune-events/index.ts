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

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("BACKEND_MAINTENANCE_CRON_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
      return json({ error: "Server is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (bearer !== cronSecret) {
      return json({ error: "Unauthorized." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const cutoffDaysInput = Number(body?.cutoffDays ?? 45);
    const cutoffDays = Math.max(14, Math.min(365, Number.isFinite(cutoffDaysInput) ? Math.round(cutoffDaysInput) : 45));
    const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString();

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await (admin.rpc as any)("prune_stale_events", {
      p_cutoff: cutoff
    });

    if (error) {
      return json({ error: error.message }, 500);
    }

    const row = Array.isArray(data) ? data[0] : data;
    return json({
      ok: true,
      cutoffDays,
      deletedEvents: Number(row?.deleted_events ?? 0)
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
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
