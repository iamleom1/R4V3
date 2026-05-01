import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, "demo", "demo-accounts.fixture.json");

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
  const expectedEmails = fixture.profiles.map((profile) => `${profile.handle}@${fixture.defaults.emailDomain}`);
  const users = await listUsersByEmail(expectedEmails);
  const userIds = users.map((user) => user.id);

  const missingEmails = expectedEmails.filter((email) => !users.some((user) => user.email?.toLowerCase() === email.toLowerCase()));
  const [profiles, rsvps, photos] = await Promise.all([
    userIds.length > 0 ? selectRows("profiles", "id,display_name,onboarding_completed", "id", userIds) : [],
    userIds.length > 0 ? selectRows("event_rsvps", "profile_id,event_id,status,looking_for_crew,events:event_id(id,title,starts_at,city)", "profile_id", userIds) : [],
    userIds.length > 0 ? selectRows("photos", "profile_id,is_primary", "profile_id", userIds) : []
  ]);

  const eventIds = new Set(rsvps.map((row) => row.event_id).filter(Boolean));
  const goingRsvps = rsvps.filter((row) => row.status === "going");
  const nonGoingRsvps = rsvps.filter((row) => row.status === "none");
  const crewVisibleRsvps = rsvps.filter((row) => row.status === "going" && row.looking_for_crew);
  const primaryPhotoProfileIds = new Set(photos.filter((row) => row.is_primary).map((row) => row.profile_id));
  const onboardedProfileIds = new Set(profiles.filter((row) => row.onboarding_completed).map((row) => row.id));

  const failures = [];
  if (missingEmails.length > 0) failures.push(`${missingEmails.length} fixture auth users are missing`);
  if (profiles.length < expectedEmails.length) failures.push(`${expectedEmails.length - profiles.length} profile rows are missing`);
  if (onboardedProfileIds.size < expectedEmails.length) failures.push(`${expectedEmails.length - onboardedProfileIds.size} profiles are not onboarding-complete`);
  if (eventIds.size < 5) failures.push(`only ${eventIds.size} distinct events have demo RSVPs; target at least 5`);
  if (goingRsvps.length < 10) failures.push(`only ${goingRsvps.length} going RSVPs; target at least 10`);
  if (nonGoingRsvps.length < 5) failures.push(`only ${nonGoingRsvps.length} non-going RSVPs; target at least 5`);
  if (crewVisibleRsvps.length < 8) failures.push(`only ${crewVisibleRsvps.length} crew-visible going RSVPs; target at least 8`);

  console.log("Demo seed verification");
  console.log(`- expected fixture users: ${expectedEmails.length}`);
  console.log(`- auth users found: ${users.length}`);
  console.log(`- profile rows found: ${profiles.length}`);
  console.log(`- distinct RSVP events: ${eventIds.size}`);
  console.log(`- going RSVPs: ${goingRsvps.length}`);
  console.log(`- non-going RSVPs: ${nonGoingRsvps.length}`);
  console.log(`- crew-visible going RSVPs: ${crewVisibleRsvps.length}`);
  console.log(`- profiles with primary photos: ${primaryPhotoProfileIds.size}`);

  if (eventIds.size > 0) {
    console.log("");
    console.log("Events with seeded RSVPs:");
    for (const eventId of eventIds) {
      const eventRows = rsvps.filter((row) => row.event_id === eventId);
      const event = eventRows[0]?.events;
      const crewCount = eventRows.filter((row) => row.status === "going" && row.looking_for_crew).length;
      console.log(`- ${event?.title ?? eventId}: ${eventRows.length} RSVPs, ${crewCount} looking for crew`);
    }
  }

  if (missingEmails.length > 0) {
    console.log("");
    console.log("Missing fixture users:");
    for (const email of missingEmails) console.log(`- ${email}`);
  }

  if (primaryPhotoProfileIds.size === 0) {
    console.log("");
    console.warn("No primary photos found for demo users. This is acceptable for a first internal beta, but profile cards will look less real.");
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exitCode = 1;
  }
}

async function selectRows(tableName, columns, filterColumn, values) {
  const { data, error } = await supabase.from(tableName).select(columns).in(filterColumn, values);
  if (error) {
    throw new Error(`Failed to read ${tableName}: ${error.message}`);
  }
  return data ?? [];
}

async function listUsersByEmail(emails) {
  const target = new Set(emails.map((email) => email.toLowerCase()));
  const found = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    for (const user of data.users ?? []) {
      if (user.email && target.has(user.email.toLowerCase())) {
        found.push(user);
      }
    }

    if ((data.users ?? []).length < perPage || found.length === target.size) {
      return found;
    }
    page += 1;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
