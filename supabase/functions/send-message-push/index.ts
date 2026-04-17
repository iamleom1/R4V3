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
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Server is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearer) {
      return json({ error: "Unauthorized." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const {
      data: { user },
      error: authError
    } = await admin.auth.getUser(bearer);

    if (authError || !user) {
      return json({ error: "Unauthorized." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const matchId = String(body?.matchId ?? "").trim();
    const messageId = String(body?.messageId ?? "").trim();
    if (!matchId || !messageId) {
      return json({ error: "matchId and messageId are required." }, 400);
    }

    const { data: messageRow, error: messageError } = await admin
      .from("messages")
      .select("id,match_id,sender_profile_id,body,created_at")
      .eq("id", messageId)
      .eq("match_id", matchId)
      .maybeSingle();

    if (messageError || !messageRow) {
      return json({ error: "Message not found." }, 404);
    }
    if (messageRow.sender_profile_id !== user.id) {
      return json({ error: "Forbidden." }, 403);
    }

    const { data: matchRow, error: matchError } = await admin
      .from("matches")
      .select("id,profile_low_id,profile_high_id")
      .eq("id", matchId)
      .maybeSingle();

    if (matchError || !matchRow) {
      return json({ error: "Match not found." }, 404);
    }

    const recipientProfileId =
      matchRow.profile_low_id === user.id
        ? matchRow.profile_high_id
        : matchRow.profile_high_id === user.id
          ? matchRow.profile_low_id
          : null;

    if (!recipientProfileId) {
      return json({ error: "Forbidden." }, 403);
    }

    const { count: blockCount } = await admin
      .from("blocks")
      .select("blocker_profile_id", { count: "exact", head: true })
      .or(`and(blocker_profile_id.eq.${user.id},blocked_profile_id.eq.${recipientProfileId}),and(blocker_profile_id.eq.${recipientProfileId},blocked_profile_id.eq.${user.id})`);

    if ((blockCount ?? 0) > 0) {
      return json({ ok: true, skipped: "blocked", sent: 0 });
    }

    const [{ data: senderProfile }, { data: tokenRows }] = await Promise.all([
      admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      admin
        .from("device_push_tokens")
        .select("expo_push_token")
        .eq("profile_id", recipientProfileId)
    ]);

    const tokens = Array.from(
      new Set(
        (tokenRows ?? [])
          .map((row) => String(row.expo_push_token ?? "").trim())
          .filter(Boolean)
      )
    );

    if (tokens.length === 0) {
      return json({ ok: true, skipped: "no_tokens", sent: 0 });
    }

    const senderName = String(senderProfile?.display_name ?? "R4V3 User").trim() || "R4V3 User";
    const preview = String(messageRow.body ?? "").trim().slice(0, 140);

    const payloads = tokens.map((to) => ({
      to,
      sound: "default",
      title: senderName,
      body: preview || "Sent you a message",
      data: {
        type: "chat_message",
        matchId,
        otherProfileId: user.id,
        title: senderName
      }
    }));

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(payloads)
    });

    const expoJson = await expoResponse.json().catch(() => ({}));
    if (!expoResponse.ok) {
      await admin.rpc("create_system_alert", {
        p_category: "push_notifications",
        p_severity: "warning",
        p_message: "Expo push request failed",
        p_details: {
          matchId,
          messageId,
          status: expoResponse.status,
          response: expoJson
        }
      });
      return json({ error: "Push provider request failed." }, 502);
    }

    const data = Array.isArray(expoJson?.data) ? expoJson.data : [];
    const failedTickets = data
      .map((ticket: any, index: number) => ({ ticket, token: tokens[index] }))
      .filter(({ ticket }) => ticket?.status === "error");

    const invalidTokens = data
      .map((ticket: any, index: number) => ({ ticket, token: tokens[index] }))
      .filter(({ ticket }) => ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered")
      .map(({ token }) => token);

    if (invalidTokens.length > 0) {
      await admin.from("device_push_tokens").delete().in("expo_push_token", invalidTokens);
    }

    if (failedTickets.length > 0) {
      await admin.rpc("create_system_alert", {
        p_category: "push_notifications",
        p_severity: "warning",
        p_message: "Expo push ticket failures detected",
        p_details: {
          matchId,
          messageId,
          failedCount: failedTickets.length,
          invalidated: invalidTokens.length,
          failures: failedTickets.slice(0, 5).map(({ ticket }) => ({
            message: ticket?.message ?? null,
            details: ticket?.details ?? null
          }))
        }
      });
    }

    return json({
      ok: true,
      sent: payloads.length,
      invalidated: invalidTokens.length,
      failed: failedTickets.length
    });
  } catch (error) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      await admin.rpc("create_system_alert", {
        p_category: "push_notifications",
        p_severity: "critical",
        p_message: "send-message-push crashed",
        p_details: {
          error: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => undefined);
    }
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
