import { getSupabaseClient } from "../../lib/supabase";

const PROFILE_PHOTO_BUCKET = "profile-photos";

export type ProfilePhoto = {
  id: string;
  profileId: string;
  storagePath: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  url: string;
};

type PhotoRow = {
  id: string;
  profile_id: string;
  storage_path: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

export async function listProfilePhotos(profileId: string): Promise<ProfilePhoto[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await (supabase.from("photos") as any)
    .select("id,profile_id,storage_path,sort_order,is_primary,created_at")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return Promise.all((data as PhotoRow[]).map((row) => buildPhotoRow(supabase, row)));
}

export async function uploadProfilePhotoToSlot(input: {
  profileId: string;
  fileUri: string;
  sortOrder: number;
  contentType?: string | null;
  fileName?: string | null;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const existing = await getPhotoBySlot(input.profileId, input.sortOrder);
  if (existing) {
    await deleteProfilePhoto({ profileId: input.profileId, photoId: existing.id, storagePath: existing.storagePath });
  }

  const response = await fetch(input.fileUri);
  const blob = await response.blob();
  const extension = inferFileExtension(input.fileName ?? input.fileUri, input.contentType);
  const storagePath = `${input.profileId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

  const storage = supabase.storage.from(PROFILE_PHOTO_BUCKET);
  const uploadRes = await storage.upload(storagePath, blob, {
    contentType: input.contentType ?? undefined,
    upsert: false
  });

  if (uploadRes.error) {
    return { ok: false as const, error: uploadRes.error.message };
  }

  const { data, error } = await (supabase.from("photos") as any)
    .insert({
      profile_id: input.profileId,
      storage_path: storagePath,
      sort_order: input.sortOrder,
      is_primary: input.sortOrder === 0
    })
    .select("id,profile_id,storage_path,sort_order,is_primary,created_at")
    .single();

  if (error || !data) {
    await storage.remove([storagePath]);
    return { ok: false as const, error: error?.message ?? "Failed to save photo metadata." };
  }

  return { ok: true as const, photo: await buildPhotoRow(supabase, data as PhotoRow) };
}

export async function deleteProfilePhoto(input: { profileId: string; photoId: string; storagePath: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const storage = supabase.storage.from(PROFILE_PHOTO_BUCKET);
  const [{ error: storageError }, { error: rowError }] = await Promise.all([
    storage.remove([input.storagePath]),
    (supabase.from("photos") as any).delete().eq("id", input.photoId).eq("profile_id", input.profileId)
  ]);

  if (storageError) {
    return { ok: false as const, error: storageError.message };
  }
  if (rowError) {
    return { ok: false as const, error: rowError.message };
  }

  return { ok: true as const };
}

export async function moveProfilePhotoToSlot(input: { profileId: string; fromSortOrder: number; toSortOrder: number }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  if (input.fromSortOrder === input.toSortOrder) {
    return { ok: true as const };
  }

  const photosTable = supabase.from("photos") as any;
  const { data: sourceRow, error: sourceError } = await photosTable
    .select("id,sort_order")
    .eq("profile_id", input.profileId)
    .eq("sort_order", input.fromSortOrder)
    .maybeSingle();

  if (sourceError || !sourceRow?.id) {
    return { ok: false as const, error: "Photo not found in source slot." };
  }

  const { data: targetRow } = await photosTable
    .select("id,sort_order")
    .eq("profile_id", input.profileId)
    .eq("sort_order", input.toSortOrder)
    .maybeSingle();

  const tempSortOrder = 999;
  const sourceId = sourceRow.id as string;
  const targetId = (targetRow?.id as string | undefined) ?? null;

  if (targetId) {
    const { error: tempError } = await photosTable.update({ sort_order: tempSortOrder }).eq("id", sourceId).eq("profile_id", input.profileId);
    if (tempError) return { ok: false as const, error: tempError.message };

    const { error: targetMoveError } = await photosTable
      .update({ sort_order: input.fromSortOrder })
      .eq("id", targetId)
      .eq("profile_id", input.profileId);
    if (targetMoveError) return { ok: false as const, error: targetMoveError.message };

    const { error: sourceMoveError } = await photosTable
      .update({ sort_order: input.toSortOrder })
      .eq("id", sourceId)
      .eq("profile_id", input.profileId);
    if (sourceMoveError) return { ok: false as const, error: sourceMoveError.message };
  } else {
    const { error: moveError } = await photosTable
      .update({ sort_order: input.toSortOrder })
      .eq("id", sourceId)
      .eq("profile_id", input.profileId);
    if (moveError) return { ok: false as const, error: moveError.message };
  }

  // Keep cover/primary flag aligned to slot 0.
  await photosTable.update({ is_primary: false }).eq("profile_id", input.profileId);
  await photosTable.update({ is_primary: true }).eq("profile_id", input.profileId).eq("sort_order", 0);

  return { ok: true as const };
}

async function getPhotoBySlot(profileId: string, sortOrder: number): Promise<ProfilePhoto | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await (supabase.from("photos") as any)
    .select("id,profile_id,storage_path,sort_order,is_primary,created_at")
    .eq("profile_id", profileId)
    .eq("sort_order", sortOrder)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return buildPhotoRow(supabase, data as PhotoRow);
}

async function buildPhotoRow(supabase: NonNullable<ReturnType<typeof getSupabaseClient>>, row: PhotoRow): Promise<ProfilePhoto> {
  const storage = supabase.storage.from(PROFILE_PHOTO_BUCKET);
  const publicUrl = storage.getPublicUrl(row.storage_path).data.publicUrl ?? "";
  let signedUrl = "";
  try {
    // Long-lived signed URL so previews survive navigation/backgrounding.
    const signed = await storage.createSignedUrl(row.storage_path, 60 * 60 * 24 * 30);
    signedUrl = signed.data?.signedUrl ?? "";
  } catch {
    signedUrl = "";
  }
  const stablePublicUrl = publicUrl ? `${publicUrl}?v=${encodeURIComponent(row.created_at)}` : "";

  return {
    id: row.id,
    profileId: row.profile_id,
    storagePath: row.storage_path,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    url: signedUrl || stablePublicUrl
  };
}

function inferFileExtension(nameOrUri: string, contentType?: string | null) {
  const lower = nameOrUri.toLowerCase();
  const fromName = lower.split("?")[0].match(/\.([a-z0-9]+)$/)?.[1];
  if (fromName) return fromName;
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  return "jpg";
}
