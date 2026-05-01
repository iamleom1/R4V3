export async function persistEvents(admin, events) {
  const validEvents = events.filter((event) => event.startsAt);
  if (validEvents.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const sourceRowsByProvider = new Map();

  for (const provider of new Set(validEvents.map((event) => event.provider))) {
    const providerIds = validEvents.filter((event) => event.provider === provider).map((event) => event.providerEventId);
    if (providerIds.length === 0) {
      continue;
    }

    const { data, error } = await admin
      .from("event_sources")
      .select("event_id,provider_event_id")
      .eq("provider", provider)
      .in("provider_event_id", providerIds);

    if (error) {
      throw new Error(`Failed loading existing ${provider} source rows: ${error.message}`);
    }

    sourceRowsByProvider.set(provider, new Map((data ?? []).map((row) => [row.provider_event_id, row.event_id])));
  }

  const updates = [];
  const inserts = [];

  for (const event of validEvents) {
    const existingEventId = sourceRowsByProvider.get(event.provider)?.get(event.providerEventId);
    if (existingEventId) {
      updates.push({ id: existingEventId, ...event });
    } else {
      inserts.push(event);
    }
  }

  let updated = 0;
  for (const event of updates) {
    const { error } = await admin
      .from("events")
      .update({
        title: event.title,
        venue_name: event.venueName,
        city: event.city,
        region: event.region,
        country: event.country,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        genre_tags: event.genreTags,
        source_primary: event.provider,
        description: event.description ?? null,
        flyer_url: event.flyerUrl,
        music_preview_url: event.musicPreviewUrl ?? null
      })
      .eq("id", event.id);

    if (error) {
      throw new Error(`Failed updating ${event.provider}:${event.providerEventId}: ${error.message}`);
    }

    const { error: sourceError } = await admin
      .from("event_sources")
      .update({
        raw_payload: event.rawPayload,
        fetched_at: new Date().toISOString()
      })
      .eq("provider", event.provider)
      .eq("provider_event_id", event.providerEventId);

    if (sourceError) {
      throw new Error(`Failed updating source payload for ${event.provider}:${event.providerEventId}: ${sourceError.message}`);
    }

    updated += 1;
  }

  let inserted = 0;
  if (inserts.length > 0) {
    const { data: insertedRows, error } = await admin
      .from("events")
      .insert(
        inserts.map((event) => ({
          title: event.title,
          venue_name: event.venueName,
          city: event.city,
          region: event.region,
          country: event.country,
          starts_at: event.startsAt,
          ends_at: event.endsAt,
          genre_tags: event.genreTags,
          source_primary: event.provider,
          description: event.description ?? null,
          flyer_url: event.flyerUrl,
          music_preview_url: event.musicPreviewUrl ?? null
        }))
      )
      .select("id");

    if (error) {
      throw new Error(`Failed inserting events: ${error.message}`);
    }

    const sourceRows = (insertedRows ?? []).map((row, index) => ({
      event_id: row.id,
      provider: inserts[index].provider,
      provider_event_id: inserts[index].providerEventId,
      raw_payload: inserts[index].rawPayload
    }));

    const { error: sourceError } = await admin.from("event_sources").upsert(sourceRows, {
      onConflict: "provider,provider_event_id"
    });

    if (sourceError) {
      throw new Error(`Failed inserting event sources: ${sourceError.message}`);
    }

    inserted = sourceRows.length;
  }

  return { inserted, updated };
}

export async function tryRecordJobRun(admin, status, details) {
  try {
    await admin.rpc("record_job_run", {
      p_job_name: "ingest-edm-events",
      p_status: status,
      p_details: details
    });
  } catch {
    // Job telemetry is optional for local/script-based ingestion.
  }
}
