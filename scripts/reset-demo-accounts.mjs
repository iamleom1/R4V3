import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, "demo", "demo-accounts.fixture.json");
const PROFILE_PHOTO_BUCKET = "profile-photos";

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
  const fixtureEmails = fixture.profiles.map((profile) => `${profile.handle}@${fixture.defaults.emailDomain}`);
  const seededUsers = await listSeededDemoUsers();
  const emails = [...new Set([...fixtureEmails, ...seededUsers.map((user) => user.email).filter(Boolean)])];

  for (const email of emails) {
    const user = await findUserByEmail(email);
    if (!user) {
      console.log(`Skipping missing demo user ${email}`);
      continue;
    }

    const photoRows = await supabase.from("photos").select("storage_path").eq("profile_id", user.id);
    if (photoRows.error) {
      throw new Error(`Failed to load photos for ${email}: ${photoRows.error.message}`);
    }

    const storagePaths = (photoRows.data ?? []).map((row) => row.storage_path).filter(Boolean);
    if (storagePaths.length > 0) {
      await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove(storagePaths);
    }

    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      throw new Error(`Failed to delete ${email}: ${error.message}`);
    }

    console.log(`Deleted demo user ${email}`);
  }
}

async function listSeededDemoUsers() {
  let page = 1;
  const perPage = 200;
  const matches = [];

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const users = data.users ?? [];
    matches.push(
      ...users.filter((user) => user.app_metadata?.seeded_demo === true || user.app_metadata?.demo_seed_batch)
    );

    if (users.length < perPage) {
      return matches;
    }

    page += 1;
  }
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
