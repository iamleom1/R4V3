import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, "demo", "demo-accounts.fixture.json");
const PHOTOS_DIR = path.join(__dirname, "demo", "photos");
const DEMO_APP_METADATA_KEY = "seeded_demo";
const DEMO_BATCH = "r4v3-demo-accounts-v1";
const PROFILE_PHOTO_BUCKET = "profile-photos";

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});

const args = parseArgs(process.argv.slice(2));

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
  validateFixture(fixture);
  const selectedEvents = await selectEvents({
    city: args.city,
    count: args.eventCount
  });

  if (selectedEvents.length === 0) {
    throw new Error(`No upcoming events found for city "${args.city}".`);
  }

  console.log(`Using ${selectedEvents.length} events for seeded demo accounts:`);
  for (const event of selectedEvents) {
    console.log(`- ${event.title} (${event.id}) @ ${event.starts_at}`);
  }

  const summary = [];

  for (let index = 0; index < fixture.profiles.length; index += 1) {
    const profile = fixture.profiles[index];
    const merged = materializeProfile(profile, fixture.defaults);
    const assignments = buildAssignments(selectedEvents, index, merged);

    if (args.dryRun) {
      summary.push({
        email: merged.email,
        displayName: merged.displayName,
        assignments
      });
      continue;
    }

    const user = await ensureDemoAuthUser(merged);
    await upsertProfile(user.id, merged);
    await syncProfilePhoto(user.id, merged);
    await syncRsvps(user.id, assignments);

    summary.push({
      email: merged.email,
      displayName: merged.displayName,
      assignments
    });
  }

  console.log("");
  console.log(args.dryRun ? "Dry run summary:" : "Seeded demo accounts:");
  for (const row of summary) {
    console.log(`- ${row.displayName} <${row.email}>`);
    for (const assignment of row.assignments) {
      console.log(`  • ${assignment.status.toUpperCase()} ${assignment.eventTitle}`);
    }
  }
}

function materializeProfile(profile, defaults) {
  const emailDomain = defaults.emailDomain;
  return {
    handle: profile.handle,
    email: `${profile.handle}@${emailDomain}`,
    password: defaults.password,
    displayName: profile.displayName,
    birthdate: profile.birthdate,
    city: profile.city ?? defaults.city,
    bio: profile.bio,
    gender: profile.gender,
    interestedGenders: profile.interestedGenders ?? [],
    preferredAgeMin: profile.preferredAgeMin ?? defaults.preferredAgeMin,
    preferredAgeMax: profile.preferredAgeMax ?? defaults.preferredAgeMax,
    vibeTags: profile.vibeTags ?? [],
    musicGenres: profile.musicGenres ?? [],
    communityModeEnabled: profile.communityModeEnabled ?? defaults.communityModeEnabled,
    datingModeEnabled: profile.datingModeEnabled ?? defaults.datingModeEnabled,
    onboardingCompleted: profile.onboardingCompleted ?? defaults.onboardingCompleted,
    crewStyle: profile.crewStyle ?? null,
    meetupStyle: profile.meetupStyle ?? null,
    safetyNote: profile.safetyNote ?? null,
    smokingPreference: profile.smokingPreference ?? null,
    drinkingPreference: profile.drinkingPreference ?? null,
    pronouns: profile.pronouns ?? null,
    education: profile.education ?? null,
    height: profile.height ?? null,
    zodiac: profile.zodiac ?? null,
    photoFile: profile.photoFile ?? null,
    intent: profile.intent === "interested" ? "none" : "going",
    lookingForCrew: profile.lookingForCrew ?? false,
    location: profile.location ?? defaults.location
  };
}

function validateFixture(fixture) {
  if (!fixture?.defaults || !Array.isArray(fixture.profiles)) {
    throw new Error("Demo fixture must include defaults and a profiles array.");
  }

  const handles = new Set();
  for (const profile of fixture.profiles) {
    if (!profile.handle || !profile.displayName || !profile.bio) {
      throw new Error("Every demo profile must include handle, displayName, and bio.");
    }
    if (handles.has(profile.handle)) {
      throw new Error(`Duplicate demo profile handle: ${profile.handle}`);
    }
    handles.add(profile.handle);
  }

  const going = fixture.profiles.filter((profile) => profile.intent !== "interested").length;
  const interested = fixture.profiles.filter((profile) => profile.intent === "interested").length;
  const lookingForCrew = fixture.profiles.filter((profile) => profile.lookingForCrew).length;

  if (fixture.profiles.length < 10) {
    console.warn(`Only ${fixture.profiles.length} demo profiles configured. Closed beta demos should use 10-20.`);
  }
  if (going === 0 || interested === 0) {
    console.warn("Demo profiles should include both going and non-going RSVP states.");
  }
  if (lookingForCrew < 5) {
    console.warn(`Only ${lookingForCrew} demo profiles have lookingForCrew enabled. Matching may look sparse.`);
  }
}

async function ensureDemoAuthUser(profile) {
  const existing = await findUserByEmail(profile.email);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      email: profile.email,
      password: profile.password,
      email_confirm: true,
      user_metadata: {
        display_name: profile.displayName
      },
      app_metadata: {
        [DEMO_APP_METADATA_KEY]: true,
        demo_seed_batch: DEMO_BATCH
      }
    });
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: profile.email,
    password: profile.password,
    email_confirm: true,
    user_metadata: {
      display_name: profile.displayName
    },
    app_metadata: {
      [DEMO_APP_METADATA_KEY]: true,
      demo_seed_batch: DEMO_BATCH
    }
  });

  if (error || !data.user) {
    throw new Error(`Failed to create auth user for ${profile.email}: ${error?.message ?? "unknown error"}`);
  }

  return data.user;
}

async function upsertProfile(userId, profile) {
  const payload = {
    id: userId,
    display_name: profile.displayName,
    birthdate: profile.birthdate,
    city: profile.city,
    bio: profile.bio,
    gender: profile.gender,
    interested_genders: profile.interestedGenders,
    preferred_age_min: profile.preferredAgeMin,
    preferred_age_max: profile.preferredAgeMax,
    vibe_tags: profile.vibeTags,
    music_genres: profile.musicGenres,
    community_mode_enabled: profile.communityModeEnabled,
    dating_mode_enabled: profile.datingModeEnabled,
    onboarding_completed: profile.onboardingCompleted,
    crew_style: profile.crewStyle,
    meetup_style: profile.meetupStyle,
    safety_note: profile.safetyNote,
    smoking_preference: profile.smokingPreference,
    drinking_preference: profile.drinkingPreference,
    pronouns: profile.pronouns,
    education: profile.education,
    height: profile.height,
    zodiac: profile.zodiac,
    location_lat: profile.location?.lat ?? null,
    location_lng: profile.location?.lng ?? null,
    location_accuracy_meters: profile.location?.accuracyMeters ?? null,
    location_captured_at: new Date().toISOString()
  };

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(`Failed to upsert profile for ${profile.email}: ${error.message}`);
  }
}

async function syncProfilePhoto(userId, profile) {
  if (!profile.photoFile) {
    return;
  }

  const localPath = path.join(PHOTOS_DIR, profile.photoFile);
  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(localPath);
  } catch {
    console.warn(`Photo missing for ${profile.email}: ${localPath}`);
    return;
  }

  const extension = path.extname(profile.photoFile) || ".png";
  const storagePath = `${userId}/demo-primary${extension}`;

  const existingRows = await supabase
    .from("photos")
    .select("id,storage_path")
    .eq("profile_id", userId)
    .order("sort_order", { ascending: true });

  if (existingRows.error) {
    throw new Error(`Failed to load existing photos for ${profile.email}: ${existingRows.error.message}`);
  }

  const obsoletePaths = (existingRows.data ?? [])
    .map((row) => row.storage_path)
    .filter((currentPath) => currentPath && currentPath !== storagePath);

  if (obsoletePaths.length > 0) {
    await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove(obsoletePaths);
    await supabase.from("photos").delete().eq("profile_id", userId).neq("storage_path", storagePath);
  }

  const contentType = guessContentType(extension);
  const uploadResult = await supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(storagePath, fileBuffer, {
    upsert: true,
    contentType
  });

  if (uploadResult.error) {
    throw new Error(`Failed to upload photo for ${profile.email}: ${uploadResult.error.message}`);
  }

  const { error } = await supabase.from("photos").upsert(
    {
      profile_id: userId,
      storage_path: storagePath,
      sort_order: 0,
      is_primary: true
    },
    { onConflict: "profile_id,sort_order" }
  );

  if (error) {
    throw new Error(`Failed to upsert photo row for ${profile.email}: ${error.message}`);
  }
}

async function syncRsvps(userId, assignments) {
  for (const assignment of assignments) {
    const payload = {
      profile_id: userId,
      event_id: assignment.eventId,
      status: assignment.status,
      looking_for_crew: assignment.status === "going" ? assignment.lookingForCrew : false
    };

    const { error } = await supabase.from("event_rsvps").upsert(payload, { onConflict: "event_id,profile_id" });
    if (error) {
      throw new Error(`Failed to upsert RSVP for event ${assignment.eventId}: ${error.message}`);
    }
  }
}

function buildAssignments(events, index, profile) {
  const primary = events[index % events.length];
  const secondary = events.length > 1 ? events[(index + Math.ceil(events.length / 2)) % events.length] : null;
  const assignments = [
    {
      eventId: primary.id,
      eventTitle: primary.title,
      status: profile.intent,
      lookingForCrew: profile.intent === "going" ? profile.lookingForCrew : false
    }
  ];

  if (secondary && secondary.id !== primary.id) {
    assignments.push({
      eventId: secondary.id,
      eventTitle: secondary.title,
      status: index % 3 === 0 ? "none" : "going",
      lookingForCrew: index % 3 === 0 ? false : profile.lookingForCrew
    });
  }

  return assignments;
}

async function selectEvents({ city, count }) {
  const { data, error } = await supabase
    .from("events")
    .select("id,title,starts_at,is_featured,promotion_rank,city")
    .ilike("city", city)
    .gte("starts_at", new Date().toISOString())
    .order("is_featured", { ascending: false })
    .order("promotion_rank", { ascending: false })
    .order("starts_at", { ascending: true })
    .limit(count);

  if (error) {
    throw new Error(`Failed to select demo events: ${error.message}`);
  }

  return data ?? [];
}

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const users = data.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      return found;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

function parseArgs(argv) {
  const args = {
    city: "Los Angeles",
    eventCount: 8,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--city") {
      args.city = argv[index + 1] ?? args.city;
      index += 1;
      continue;
    }
    if (current === "--event-count") {
      args.eventCount = Number.parseInt(argv[index + 1] ?? String(args.eventCount), 10) || args.eventCount;
      index += 1;
      continue;
    }
    if (current === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function guessContentType(extension) {
  switch (extension.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
