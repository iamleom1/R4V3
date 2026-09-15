export async function loadPromoterSources(admin) {
  const sources = [];
  // Page explicitly so the database's response limit cannot silently drop promoters.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from("promoter_sources")
      .select("id,name,provider,organizer_slug,default_city,default_region,default_country")
      .eq("status", "approved").eq("enabled", true)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error(`Failed loading promoter sources: ${error.message}`);
    sources.push(...(data ?? []));
    if (!data || data.length < 500) return sources;
  }
}

export async function recordPromoterFetch(admin, result) {
  const { error } = await admin.from("promoter_sources").update({
    last_fetched_at: new Date().toISOString(),
    last_fetch_status: result.status,
    last_event_count: result.status === "success" ? result.eventCount : null,
    last_error: result.error ?? null
  }).eq("id", result.sourceId);
  if (error) throw new Error(`Failed recording promoter fetch: ${error.message}`);
}
